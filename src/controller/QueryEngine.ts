// QueryEngine.ts

import {
	Section,
	DatasetsProvider,
	DatasetUtils,
	InsightFacadeKey,
	OptionsState,
	maxResults,
	Transformations,
	ApplyRule,
	RoomsDataset,
	SectionsDataset,
	Room,
	Keywords,
} from "./Dataset";
import { FilterByDataset, FilterStrategy, FilterOperationByDataset } from "./Filter";
import { InsightError, InsightResult, ResultTooLargeError, InsightDatasetKind } from "./IInsightFacade";
import { OptionsProcessor } from "./OptionsProcessor";
import { ApplyProcessor } from "./ApplyProcessor";

export class QueryEngine {
	private readonly datasets: DatasetsProvider;
	private options?: OptionsState;
	private applyProcessor?: ApplyProcessor;

	constructor(datasets: DatasetsProvider) {
		this.datasets = datasets;
	}

	/**
	 *
	 * @param query The query object in accordance with IInsightFacade.performQuery
	 * @throws InsightError if query is improperly formed
	 */
	public async processQuery(queryRaw: unknown): Promise<InsightResult[]> {
		const query = DatasetUtils.checkIsObject("Query", queryRaw);
		const rootStructure = DatasetUtils.requireExactKeys(query, [
			[Keywords.Options, true],
			[Keywords.Body, true],
			[Keywords.Transformations, false],
		]);

		let applyKeys: string[] = [];
		let transformations: Transformations | undefined = undefined;

		if (rootStructure.has(Keywords.Transformations)) {
			transformations = rootStructure.get(Keywords.Transformations) as Transformations;
			applyKeys = this.extractApplyKeys(transformations.APPLY);
		}

		const optionsProcessor = new OptionsProcessor(rootStructure.get(Keywords.Options), applyKeys);
		this.options = optionsProcessor.processOptions(transformations);

		// Initialize ApplyProcessor if APPLY rules exist
		if (applyKeys.length > 0) {
			this.applyProcessor = new ApplyProcessor(this.options.datasetId);
		}

		const data = this.processBody(rootStructure.get(Keywords.Body));

		let transformedData = data;

		if (transformations) {
			transformedData = this.applyTransformations(data, transformations);
		}

		if (transformedData.length > maxResults) {
			throw new ResultTooLargeError();
		}

		const orderedData = this.orderResults(transformedData);

		return orderedData.map((item) => this.toInsightResult(item));
	}

	/**
	 * Converts an item to an InsightResult based on selected columns.
	 * @param item The data item (Section or Room)
	 * @returns The formatted InsightResult
	 */
	private toInsightResult(item: any): InsightResult {
		const result: InsightResult = {};
		const itemWithKeys = item as Record<string, any>;

		this.options!.columns.forEach((column) => {
			let value: any;
			if (column.idstring === "") {
				value = itemWithKeys[column.field];
				result[column.field] = value;
			} else {
				const fieldName = column.field;
				value = itemWithKeys[fieldName];
				result[`${column.idstring}_${fieldName}`] = value;
			}
		});
		return result;
	}

	/**
	 * Orders the data based on the ORDER specification.
	 * @param data The data to sort
	 * @returns The sorted data
	 */
	private orderResults(data: any[]): any[] {
		if (this.options!.order) {
			const { dir, keys } = this.options!.order!;
			const direction = dir === "UP" ? 1 : -1;

			data.sort((a, b) => {
				for (const key of keys) {
					const aValue = this.extractValue(a, key);
					const bValue = this.extractValue(b, key);

					if (typeof aValue === "number" && typeof bValue === "number") {
						if (aValue < bValue) {
							return -1 * direction;
						}
						if (aValue > bValue) {
							return 1 * direction;
						}
					} else if (typeof aValue === "string" && typeof bValue === "string") {
						if (aValue < bValue) {
							return -1 * direction;
						}
						if (aValue > bValue) {
							return 1 * direction;
						}
					} else {
						throw new InsightError("Incompatible types for ordering.");
					}
				}
				return 0;
			});
		}

		return data;
	}

	// Helper method to extract the value from an item based on the key
	private extractValue(item: any, key: string): any {
		const datasetPrefix = `${this.options!.datasetId}_`;
		if (key.startsWith(datasetPrefix)) {
			const fieldName = key.substring(datasetPrefix.length);
			return item[fieldName];
		}
		return item[key];
	}

	/**
	 * Processes the WHERE part of the query to filter data.
	 * @param bodyRaw The raw WHERE object
	 * @returns The filtered data
	 */
	private processBody(bodyRaw: unknown): any[] {
		const body = DatasetUtils.checkIsObject(Keywords.Body, bodyRaw);

		// Determine the dataset based on the datasetKind from options
		const datasetKind = this.options!.datasetId;
		const dataset = DatasetUtils.findDatasetById(this.datasets, this.options!.datasetId);

		if (dataset === undefined) {
			throw new InsightError(`Could not find dataset with kind: ${datasetKind}.`);
		}

		let filter: FilterStrategy<any, FilterOperationByDataset<any>>;

		if (dataset.type === InsightDatasetKind.Sections) {
			filter = new FilterByDataset<Section>(dataset as SectionsDataset);
		} else if (dataset.type === InsightDatasetKind.Rooms) {
			filter = new FilterByDataset<Room>(dataset as RoomsDataset);
		} else {
			throw new InsightError("Unsupported dataset kind.");
		}

		const filterFunction = this.checkSingleFilter(filter, body);

		const filteredData = filterFunction.apply();

		return filteredData;
	}

	/**
	 * Takes a query body and constructs a filter operation.
	 *
	 * @param filter the filter object used
	 * @param bodyRaw the raw body to check
	 * @returns A filter operation representing the given body and filter
	 * @throws InsightError if bodyRaw is improperly formatted
	 */
	private checkSingleFilter(
		filter: FilterStrategy<any, FilterOperationByDataset<any>>,
		bodyRaw: unknown
	): FilterOperationByDataset<any> {
		// Retrieve body and ensure it is an object
		const body = DatasetUtils.checkIsObject(Keywords.Body, bodyRaw);

		// Break down by property name
		const mappedKeys = DatasetUtils.requireExactKeys(body, [
			[Keywords.Filter.Logic.And, false],
			[Keywords.Filter.Logic.Or, false],
			[Keywords.Filter.MComparator.Equal, false],
			[Keywords.Filter.MComparator.GreaterThan, false],
			[Keywords.Filter.MComparator.LessThan, false],
			[Keywords.Filter.Negation.Not, false],
			[Keywords.Filter.SComparator.Is, false],
		]);

		// Only one root filter can be applied
		if (mappedKeys.size > 1) {
			throw new InsightError("Can only have 1 filter applied here: " + JSON.stringify(mappedKeys) + ".");
		}

		// Base case filter: return everything
		let filterOp = filter.all();

		// This will run 1 or 0 times
		mappedKeys.forEach((value, key) => (filterOp = this.processFilter(filter, key, value)));

		return filterOp;
	}

	/**
	 *
	 * @param filter the filter object used
	 * @param key the filter key to check
	 * @param value the value of the filter key in the query object
	 * @returns A filter operation for the given key and children
	 * @throws InsightError if the provided key could not be processed correctly
	 */
	private processFilter(
		filter: FilterStrategy<any, FilterOperationByDataset<any>>,
		key: string,
		value: unknown
	): FilterOperationByDataset<any> {
		switch (key) {
			case Keywords.Filter.Logic.And:
			case Keywords.Filter.Logic.Or: {
				const children = DatasetUtils.checkIsArray(key, value).map((e) => this.checkSingleFilter(filter, e));
				if (children.length === 0) {
					throw new InsightError(`${key} must have children`);
				}
				return key === Keywords.Filter.Logic.And ? filter.and(children) : filter.or(children);
			}
			case Keywords.Filter.MComparator.Equal:
			case Keywords.Filter.MComparator.GreaterThan:
			case Keywords.Filter.MComparator.LessThan: {
				const [columnKey, filterVal] = this.checkKey(key, value, true);
				const valNum = DatasetUtils.checkIsNumber(key, filterVal);
				return key === Keywords.Filter.MComparator.Equal
					? filter.equals(valNum, columnKey)
					: key === Keywords.Filter.MComparator.LessThan
					? filter.lessThan(valNum, columnKey)
					: filter.greaterThan(valNum, columnKey);
			}
			case Keywords.Filter.Negation.Not:
				return filter.not(this.checkSingleFilter(filter, value));
			case Keywords.Filter.SComparator.Is: {
				const [columnKey, filterVal] = this.checkKey(Keywords.Filter.SComparator.Is, value, false);
				return filter.is(DatasetUtils.checkIsString(Keywords.Filter.SComparator.Is, filterVal), columnKey);
			}
			default:
				throw new InsightError(`Filter key not recognized: ${key}`);
		}
	}

	/**
	 *
	 * @param type the key type checking under (ie. Keywords.Filter.MComparator.Equal)
	 * @param bodyRaw the raw body under this key (ie. { "key": "value" })
	 * @param mkeyOrSKey true if mkey false if skey
	 * @returns a tuple of the parsed key and value
	 */
	private checkKey(type: string, bodyRaw: unknown, mkeyOrSKey: boolean): [InsightFacadeKey, unknown] {
		// Ensure child is an object
		const keyBody = DatasetUtils.checkIsObject(type, bodyRaw);
		// Ensure body has a single key value pair
		const bodyEntries = Array.from(Object.entries(keyBody));
		if (bodyEntries.length !== 1) {
			throw new InsightError(`Expected exactly one key in "${type}" operation, but found ${bodyEntries.length}.`);
		}

		// Extract key and value
		const [rawKey, keyValue] = bodyEntries[0];

		// Parse the key
		const key = DatasetUtils.parseMOrSKey(rawKey);
		if (!key) {
			throw new InsightError(`Invalid key format: "${rawKey}". Expected format "dataset_field".`);
		}

		// Ensure the key belongs to the correct dataset
		// if (this.options!.datasetId !== key.kind) {
		// 	throw new InsightError("Key does not belong to the data");
		// }

		// Validate key type based on operation
		if (DatasetUtils.isMKey(key)) {
			if (!mkeyOrSKey) {
				throw new InsightError("Expected a string key , but got a numeric key");
			}
		} else if (DatasetUtils.isSKey(key)) {
			if (mkeyOrSKey) {
				throw new InsightError("Expected a numeric key got a string key");
			}
		} else {
			throw new InsightError(`Key "${rawKey}" is neither a valid MKey nor an SKey.`);
		}

		return [key, keyValue];
	}

	/**
	 *
	 * @param data the array of objects to be grouped
	 * @param groupKeys the keys on which to base the grouping
	 * @returns a map where each key is a unique string made up of values from groupkeys
	 */
	private groupData<T extends object>(data: T[], groupKeys: string[]): Map<string, T[]> {
		const grouped = new Map<string, T[]>();

		for (const item of data) {
			const key = groupKeys
				.map((keyOfGroup) => {
					const fieldName = keyOfGroup.startsWith(`${this.options!.datasetId}_`)
						? keyOfGroup.substring(this.options!.datasetId.length + 1)
						: keyOfGroup;
					return (item as Record<string, any>)[fieldName];
				})
				.join("-");

			if (!grouped.has(key)) {
				grouped.set(key, []);
			}
			grouped.get(key)!.push(item);
		}

		return grouped;
	}

	/**
	 * Applies transformations (GROUP and APPLY) to the data.
	 * @param data The data to transform.
	 * @param transformations The transformations to apply.
	 * @returns The transformed data.
	 */
	private applyTransformations(data: any[], transformations: Transformations): any[] {
		const { GROUP, APPLY } = transformations;

		// Check for duplicate APPLY keys
		const applyKeys = APPLY.map((applyRule) => Object.keys(applyRule)[0]);
		const uniqueApplyKeys = new Set(applyKeys);
		if (applyKeys.length !== uniqueApplyKeys.size) {
			throw new InsightError("Duplicate APPLY keys found.");
		}

		const groupedData = this.groupData(data, GROUP);

		const results: any[] = [];
		for (const [, items] of groupedData.entries()) {
			const result = this.initializeGroupResult(GROUP, items);

			// Process each APPLY rule
			for (const applyRule of APPLY) {
				this.processApplyRule(applyRule, items, result);
			}

			results.push(result);
		}

		return results;
	}

	// Initializes the result object with group keys
	private initializeGroupResult<T extends object>(GROUP: string[], items: T[]): any {
		// 'any' because it can be Section or Room
		const result: any = {};
		const itemWithKeys = items[0] as Record<string, any>;
		GROUP.forEach((groupKey) => {
			const fieldName = groupKey.startsWith(`${this.options!.datasetId}_`)
				? groupKey.substring(this.options!.datasetId.length + 1)
				: groupKey;
			result[fieldName] = itemWithKeys[fieldName];
		});
		return result;
	}

	/**
	 * Processes a single APPLY rule and modifies the result object
	 * Now delegates to ApplyProcessor
	 */
	private processApplyRule(applyRule: ApplyRule, items: any[], result: any): void {
		if (!this.applyProcessor) {
			throw new InsightError("ApplyProcessor is not initialized.");
		}
		result[Object.keys(applyRule)[0]] = this.applyProcessor.processApplyRule(applyRule, items);
	}

	/**
	 * Extracts APPLY keys from the APPLY array.
	 * @param applyArray The array of APPLY rules.
	 * @returns An array of APPLY keys.
	 * @throws InsightError if duplicate APPLY keys are detected.
	 */
	public extractApplyKeys(applyArray: ApplyRule[]): string[] {
		const applyKeys = applyArray.map((applyRule) => Object.keys(applyRule)[0]);
		const uniqueApplyKeys = Array.from(new Set(applyKeys));
		if (applyKeys.length !== uniqueApplyKeys.length) {
			throw new InsightError("Duplicate APPLY keys detected.");
		}
		return uniqueApplyKeys;
	}
}

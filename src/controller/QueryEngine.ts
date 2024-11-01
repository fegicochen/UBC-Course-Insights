import {
	Section,
	DatasetsProvider,
	DatasetUtils,
	InsightFacadeKey,
	Keywords,
	OptionsState,
	maxResults,
	Transformations,
	ApplyRule,
	RoomsDataset,
	SectionsDataset,
	Room,
} from "./Dataset";
import { FilterByDataset, FilterStrategy, FilterOperationByDataset } from "./Filter";
import { InsightError, InsightResult, ResultTooLargeError, InsightDatasetKind } from "./IInsightFacade";
import { calculateMax, calculateMin, calculateSum, calculateCount, calculateAvg } from "./Calculations";
import { OptionsProcessor } from "./OptionsProcessor";

export class QueryEngine {
	private readonly datasets: DatasetsProvider;
	private options?: OptionsState;

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

		if (rootStructure.has(Keywords.Transformations)) {
			const transformations = rootStructure.get(Keywords.Transformations) as Transformations;
			applyKeys = this.extractApplyKeys(transformations.APPLY);
		}

		const optionsProcessor = new OptionsProcessor(rootStructure.get(Keywords.Options), applyKeys);
		this.options = optionsProcessor.processOptions();

		const data = this.processBody(rootStructure.get(Keywords.Body));

		let transformedData = data;

		if (rootStructure.has(Keywords.Transformations)) {
			const transformations = rootStructure.get(Keywords.Transformations) as Transformations;
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
		// 'any' because it can be Section or Room
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
		const datasetPrefix = this.options!.datasetKind + "_";
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

		// Determine the dataset based on the fields used in the query
		const columns = this.options!.columns;
		if (columns.length === 0) {
			throw new InsightError("No columns specified in the query.");
		}

		// Extract dataset kind from the first column
		const firstColumn = columns[0];
		const datasetKind = firstColumn.kind;
		const dataset = DatasetUtils.findDatasetByKind(this.datasets, datasetKind);

		if (dataset === undefined) {
			throw new InsightError("Could not find dataset with id: " + this.options!.datasetId + ".");
		}

		let filter: FilterStrategy<any, FilterOperationByDataset<any>>;

		if (dataset.type === InsightDatasetKind.Sections) {
			filter = new FilterByDataset<Section>(dataset as SectionsDataset);
		} else if (dataset.type === InsightDatasetKind.Rooms) {
			filter = new FilterByDataset<Room>(dataset as RoomsDataset);
		} else {
			throw new InsightError("Unsupported dataset kind.");
		}

		// Start constructing filter function
		const filterFunction = this.checkSingleFilter(filter, bodyRaw);

		// Execute filter function
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
			throw new InsightError("Expected one entry in an mkey field.");
		}

		// Check that entry has properly formatted key and value
		const key = DatasetUtils.parseMOrSKey(bodyEntries[0][0]);
		const keyValue = bodyEntries[0][1];

		if (key === undefined) {
			throw new InsightError("Improper structure of key: " + bodyEntries[0][0]);
		}

		// Check for multi datasets used
		if (this.options!.datasetKind !== key.kind) {
			throw new InsightError("Only one dataset can be used in a query.");
		}

		if (DatasetUtils.isMKey(key)) {
			if (!mkeyOrSKey) {
				throw new InsightError("Expected mkey but got skey.");
			}
			return [key, keyValue];
		} else if (DatasetUtils.isSKey(key)) {
			if (mkeyOrSKey) {
				throw new InsightError("Expected skey but got mkey.");
			}
			return [key, keyValue];
		} else {
			throw new InsightError("Unexpected key type: " + type + ", " + bodyEntries[0][0]);
		}
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
					const fieldName = keyOfGroup.startsWith(this.options!.datasetKind + "_")
						? keyOfGroup.substring(this.options!.datasetKind.length + 1)
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

	private applyTransformations(data: any[], transformations: Transformations): any[] {
		// 'any' because it can be Section or Room
		const { GROUP, APPLY } = transformations;
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
			const fieldName = groupKey.startsWith(this.options!.datasetKind + "_")
				? groupKey.substring(this.options!.datasetKind.length + 1)
				: groupKey;
			result[fieldName] = itemWithKeys[fieldName];
		});
		return result;
	}

	// Processes a single APPLY rule and modifies the result object
	private processApplyRule(applyRule: ApplyRule, items: any[], result: any): void {
		// 'any' because it can be Section or Room
		const applyKey = Object.keys(applyRule)[0];
		const applyObject = applyRule[applyKey];
		const [operation, field] = Object.entries(applyObject)[0];

		// Remove dataset ID prefix from field name if present
		const fieldName = field.startsWith(this.options!.datasetKind + "_")
			? field.substring(this.options!.datasetKind.length + 1)
			: field;

		const values = items.map((item) => (item as Record<string, any>)[fieldName]);

		switch (operation) {
			case Keywords.ApplyToken.Max:
				result[applyKey] = calculateMax(values);
				break;
			case Keywords.ApplyToken.Min:
				result[applyKey] = calculateMin(values);
				break;
			case Keywords.ApplyToken.Sum:
				result[applyKey] = calculateSum(values);
				break;
			case Keywords.ApplyToken.Count:
				result[applyKey] = calculateCount(values);
				break;
			case Keywords.ApplyToken.Avg:
				result[applyKey] = calculateAvg(values);
				break;
			default:
				throw new InsightError(`Invalid APPLY token: ${operation}`);
		}
	}

	private extractApplyKeys(applyArray: ApplyRule[]): string[] {
		return applyArray.map((applyRule) => Object.keys(applyRule)[0]);
	}
}

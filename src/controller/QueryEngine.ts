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
	SectionWithDynamicKeys,
} from "./Dataset";
import { FilterBySection, FilterOperation, FilterStrategy } from "./Filter";
import { InsightError, InsightResult, ResultTooLargeError } from "./IInsightFacade";
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

		const sections = this.processBody(rootStructure.get(Keywords.Body));

		let transformedSections = sections;

		if (rootStructure.has(Keywords.Transformations)) {
			const transformations = rootStructure.get(Keywords.Transformations) as Transformations;
			transformedSections = this.applyTransformations(sections, transformations);
		}

		if (transformedSections.length > maxResults) {
			throw new ResultTooLargeError();
		}

		const sectionsOrdered = this.orderResults(transformedSections);

		return sectionsOrdered.map((s) => this.sectionToInsightResult(s));
	}

	/**
	 *
	 * @param section the section to convert
	 * @returns an InsightResult with only the columns selected and dataset id appended to entries
	 */
	private sectionToInsightResult(section: Section): InsightResult {
		const result: InsightResult = {};
		const sectionWithKeys = section as SectionWithDynamicKeys;

		this.options!.columns.forEach((column) => {
			let value: any;
			if (column.idstring === "") {
				value = sectionWithKeys[column.field];
				result[column.field] = value;
			} else {
				const fieldName = column.field;
				value = sectionWithKeys[fieldName];
				result[column.idstring + "_" + column.field] = value;
			}
		});
		return result;
	}

	/**
	 *
	 * @param sections the sections to order
	 * @returns an ordered list of sections based on this.options ordering
	 */
	private orderResults(sections: Section[]): Section[] {
		if (this.options!.order) {
			const { dir, keys } = this.options!.order!;
			const direction = dir === "UP" ? 1 : -1;

			sections.sort((a, b) => {
				for (const key of keys) {
					const aValue = this.extractValue(a, key);
					const bValue = this.extractValue(b, key);

					let comparison = 0;

					if (typeof aValue === "number" && typeof bValue === "number") {
						comparison = aValue - bValue;
					} else if (typeof aValue === "string" && typeof bValue === "string") {
						if (aValue < bValue) {
							comparison = -1;
						} else if (aValue > bValue) {
							comparison = 1;
						} else {
							comparison = 0;
						}
					} else {
						throw new InsightError();
					}

					if (comparison !== 0) {
						return comparison * direction;
					}
				}
				return 0;
			});
		}

		return sections;
	}

	// Helper method to extract the value from a section based on the key
	private extractValue(section: Section, key: string): any {
		const fieldName = key.startsWith(this.options!.datasetId + "_")
			? key.substring(this.options!.datasetId.length + 1)
			: key;
		return (section as SectionWithDynamicKeys)[fieldName];
	}

	/**
	 * @param query query object to take body from.
	 * @throws InsightError if options are malformed.
	 */
	private processBody(bodyRaw: unknown): Section[] {
		// Find dataset
		const dataset = DatasetUtils.findDataset(this.datasets, this.options!!.datasetId);
		if (dataset === undefined) {
			throw new InsightError("Could not find dataset with id: " + this.options!!.datasetId + ".");
		}

		// Create filter object
		const filter = new FilterBySection(dataset);

		// Start constructing filter function
		const filterFunction = this.checkSingleFilter(filter, bodyRaw);

		// Execute filter function
		const sections = filterFunction.apply();

		return sections;
	}

	/**
	 * Takes a section of the body and checks that a single filter is correctly applied within it.
	 *
	 * @param filter the filter object used
	 * @param bodyRaw the raw body to check
	 * @returns A filter operation representing the given body and filter
	 * @throws InsightError if bodyRaw is improperly formatted
	 */
	private checkSingleFilter(filter: FilterStrategy<any>, bodyRaw: unknown): FilterOperation {
		// Retrieve body and ensure it is JSON
		const body = DatasetUtils.checkIsObject(Keywords.Body, bodyRaw);

		// Break do:wn by property name
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
	private processFilter(filter: FilterStrategy<any>, key: string, value: unknown): FilterOperation {
		switch (key) {
			case Keywords.Filter.Logic.And:
			case Keywords.Filter.Logic.Or: {
				const array = DatasetUtils.checkIsArray(key, value);
				const children = array.map((elem) => this.checkSingleFilter(filter, elem));
				if (children.length === 0) {
					throw new InsightError(key + " must have children");
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
				const valStr = DatasetUtils.checkIsString(Keywords.Filter.SComparator.Is, filterVal);
				return filter.is(valStr, columnKey);
			}
			default:
				throw new InsightError("Filter key not recognized: " + key);
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
		if (this.options!!.datasetId !== key.idstring) {
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
	private groupData(data: any[], groupKeys: string[]): Map<string, any[]> {
		const grouped = new Map<string, any[]>();

		for (const item of data) {
			const itemWithKeys = item as SectionWithDynamicKeys;
			const key = groupKeys
				.map((keyofgroup) => {
					// Remove dataset ID prefix from group key if present
					const fieldName = keyofgroup.startsWith(this.options!.datasetId + "_")
						? keyofgroup.substring(this.options!.datasetId.length + 1)
						: keyofgroup;
					return itemWithKeys[fieldName];
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
	private initializeGroupResult(GROUP: string[], items: any[]): any {
		const result: any = {};
		const itemWithKeys = items[0] as SectionWithDynamicKeys;
		GROUP.forEach((groupKey) => {
			// Remove dataset ID prefix from group key if present
			const fieldName = groupKey.startsWith(this.options!.datasetId + "_")
				? groupKey.substring(this.options!.datasetId.length + 1)
				: groupKey;
			// Store the field in result without dataset ID prefix
			result[fieldName] = itemWithKeys[fieldName];
		});
		return result;
	}

	// Processes a single APPLY rule and modifies the result object
	private processApplyRule(applyRule: ApplyRule, items: any[], result: any): void {
		const applyKey = Object.keys(applyRule)[0];
		const applyObject = applyRule[applyKey];
		const [operation, field] = Object.entries(applyObject)[0];

		// Remove dataset ID prefix from field name if present
		const fieldName = field.startsWith(this.options!.datasetId + "_")
			? field.substring(this.options!.datasetId.length + 1)
			: field;

		const values = items.map((item) => (item as SectionWithDynamicKeys)[fieldName]);

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

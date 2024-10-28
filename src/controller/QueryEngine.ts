import {
	Section,
	DatasetsProvider,
	DatasetUtils,
	InsightFacadeKey,
	Keywords,
	OptionsState,
	maxResults,
} from "./Dataset";
import { FilterBySection, FilterOperation, FilterStrategy } from "./Filter";
import { InsightError, InsightResult, ResultTooLargeError } from "./IInsightFacade";
// import Decimal from "decimal.js";

export class QueryEngine {
	private readonly datasets: DatasetsProvider;
	private options?: OptionsState;

	constructor(datasets: DatasetsProvider) {
		this.datasets = datasets;
	}

	/**
	 *
	 * @param query The query object in accordance with IInsightFacade.performQuery
	 * @throws InsightError if query is improprly formed
	 */
	public async processQuery(queryRaw: unknown): Promise<InsightResult[]> {
		// Ensure query is obect and update type
		const query = DatasetUtils.checkIsObject("Query", queryRaw);

		// Ensure only keys are body and options
		const rootStructure = DatasetUtils.requireExactKeys(query, [
			[Keywords.Options, true],
			[Keywords.Body, true],
		]);

		// Split into processing body and options
		this.options = this.processOptions(rootStructure.get(Keywords.Options));
		const sections = this.processBody(rootStructure.get(Keywords.Body));

		// Sort results if required
		const sectionsOrdered = this.orderResults(sections);

		// Return only data requested
		return sectionsOrdered.map((s) => this.sectionToInsightResult(s));
	}

	/**
	 *
	 * @param section the section to convert
	 * @returns an InsightResult with only the columns selected and dataset id appended to entries
	 */
	private sectionToInsightResult(section: Section): InsightResult {
		const result: InsightResult = {};
		this.options!!.columns.forEach((column) => {
			const sectionValue = section[column.field];
			result[this.options!!.datasetId + "_" + column.field] = sectionValue;
		});
		return result;
	}

	/**
	 *
	 * @param sections the sections to order
	 * @returns an ordered list of sections based on this.options ordering
	 */
	private orderResults(sections: Section[]): Section[] {
		// Sort result data
		if (this.options!!.order !== undefined) {
			const order = this.options!!.order!!;
			let comparator: (a: Section, b: Section) => number;
			if (DatasetUtils.isMKey(order.field)) {
				comparator = (a, b): number => (a[order.field] as number) - (b[order.field] as number);
			} else if (DatasetUtils.isSKey(order.field)) {
				comparator = (a, b): number => (a[order.field] as string).localeCompare(b[order.field] as string);
			} else {
				throw new InsightError("Invalid key type! " + order.field);
			}
			return sections.reverse().sort(comparator);
		} else {
			return sections;
		}
	}

	/**
	 * @param query query object to take body from.
	 * @throws InsightError if options are malformed.
	 */
	private processOptions(optionsRaw: unknown): OptionsState {
		// Retrieve options and ensure it is JSON
		const options = DatasetUtils.checkIsObject(Keywords.Options, optionsRaw);

		// Break down by property name
		const optionsStructure = DatasetUtils.requireExactKeys(options, [
			[Keywords.Columns, true],
			[Keywords.Order, false],
		]);

		const [columnsForState, datasetIdForState] = this.parseColumns(optionsStructure);
		const orderForState = this.processOrder(optionsStructure, datasetIdForState);
		// Ensure order field is selected in columns
		if (
			orderForState !== undefined &&
			columnsForState.find((col) => col.field === orderForState?.field) === undefined
		) {
			throw new InsightError("Order field not selected in columns.");
		}

		return {
			columns: columnsForState,
			order: orderForState,
			datasetId: datasetIdForState,
		};
	}

	/**
	 *
	 * @param optionsStructure the parsed key-value structure of data in the options field
	 * @returns parsed columns as InsightFacadeKeys and the dataset id used in the query
	 */
	private parseColumns(optionsStructure: Map<string, unknown>): [InsightFacadeKey[], string] {
		let columnsForState: InsightFacadeKey[] = [];
		let datasetIdForState: string | undefined;

		// Process columns key list
		const columns = DatasetUtils.checkIsArray(Keywords.Columns, optionsStructure.get(Keywords.Columns));
		columns.forEach((columnRaw) => {
			// Ensure column key has proper formatting
			const column = DatasetUtils.checkIsString(Keywords.Columns, columnRaw);
			const columnKey = DatasetUtils.parseMOrSKey(column);
			if (columnKey === undefined) {
				throw new InsightError("Improper column key formatting: " + column + ".");
			}
			// Ensure multiple datasets not used in column keys
			if (datasetIdForState !== undefined && datasetIdForState !== columnKey.idstring) {
				throw new InsightError("Multiple datasets used in query. Only one allowed.");
			} else {
				datasetIdForState = columnKey.idstring;
			}
			columnsForState = columnsForState.concat(columnKey);
		});

		// Query must have columns selected
		if (datasetIdForState === undefined) {
			throw new InsightError("Query must select at least one column.");
		}

		return [columnsForState, datasetIdForState];
	}

	/**
	 *
	 * @param optionsStructure the parsed key-value structure of data in the options field
	 * @returns an order if present, otherwise undefined
	 */
	private processOrder(
		optionsStructure: Map<string, unknown>,
		datasetIdForState: string
	): InsightFacadeKey | undefined {
		let orderForState: InsightFacadeKey | undefined;
		if (optionsStructure.has(Keywords.Order) && optionsStructure.get(Keywords.Order) !== undefined) {
			const order = DatasetUtils.checkIsString(Keywords.Order, optionsStructure.get(Keywords.Order));
			const orderKey = DatasetUtils.parseMOrSKey(order);
			if (orderKey !== undefined) {
				orderForState = orderKey;
				if (orderKey.idstring !== datasetIdForState) {
					throw new InsightError("Mutliple datasets used in query. Only one allowed.");
				}
			} else {
				throw new InsightError("Order is not a valid ID string: " + order + ".");
			}
		}
		return orderForState;
	}

	/**
	 *
	 * @param query query object to take body from.
	 * @param options the options state computed
	 * @throws InsightError if body is malformed.
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

		if (sections.length > maxResults) {
			throw new ResultTooLargeError();
		}

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
}

import { Section, DatasetsProvider, DatasetUtils, InsightFacadeKey, Keywords, OptionsState } from "./Dataset";
import { Filter, FilterOperation } from "./Filter";
import { InsightError, InsightResult, ResultTooLargeError } from "./IInsightFacade";

export class QueryEngine {
	private readonly datasets: DatasetsProvider;

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
		const query = QueryEngine.checkIsObject("Query", queryRaw);

		// Ensure only keys are body and options
		const rootStructure = QueryEngine.requireKeys(query, [
			[Keywords.Options, true],
			[Keywords.Body, true],
		]);

		// Split into processing body and options
		const options = this.processOptions(rootStructure.get(Keywords.Options));
		const sections = this.processBody(rootStructure.get(Keywords.Body), options);

		// Return only data requested
		return sections.map((section) => {
			const result: InsightResult = {};
			options.columns.forEach((column) => {
				result[column.field] = section[column.field];
			});
			return result;
		});
	}

	/**
	 * @param query query object to take body from.
	 * @throws InsightError if options are malformed.
	 */
	private processOptions(optionsRaw: unknown): OptionsState {
		// Retrieve options and ensure it is JSON
		const options = QueryEngine.checkIsObject(Keywords.Options, optionsRaw);

		// Break down by property name
		const optionsStructure = QueryEngine.requireKeys(options, [
			[Keywords.Columns, true],
			[Keywords.Order, false],
		]);

		const [columnsForState, datasetIdForState] = this.parseColumns(optionsStructure);
		const orderForState = this.processOrder(optionsStructure, datasetIdForState);

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
		const columns = QueryEngine.checkIsArray(Keywords.Columns, optionsStructure.get(Keywords.Columns));
		columns.forEach((columnRaw) => {
			// Ensure column key has proper formatting
			const column = QueryEngine.checkIsString(Keywords.Columns, columnRaw);
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
			const order = QueryEngine.checkIsString(Keywords.Order, optionsStructure.get(Keywords.Order));
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
	private processBody(bodyRaw: unknown, options: OptionsState): Section[] {
		const filter = new Filter(this.datasets, options);

		const filterFunction = QueryEngine.checkSingleFilter(filter, bodyRaw);

		const sections = filterFunction();

		const maxResults = 5000;
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
	private static checkSingleFilter(filter: Filter, bodyRaw: unknown): FilterOperation {
		// Retrieve body and ensure it is JSON
		const body = QueryEngine.checkIsObject(Keywords.Body, bodyRaw);

		// Break down by property name
		const mappedKeys = QueryEngine.requireKeys(body, [
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
	private static processFilter(filter: Filter, key: string, value: unknown): FilterOperation {
		if (key === Keywords.Filter.Logic.And) {
			const array = QueryEngine.checkIsArray(Keywords.Filter.Logic.And, value);
			return filter.and(array.map((elem) => QueryEngine.checkSingleFilter(filter, elem)));
		} else if (key === Keywords.Filter.Logic.Or) {
			const array = QueryEngine.checkIsArray(Keywords.Filter.Logic.And, value);
			return filter.or(array.map((elem) => QueryEngine.checkSingleFilter(filter, elem)));
		} else if (key === Keywords.Filter.MComparator.Equal) {
			const [columnKey, filterVal] = this.checkKey(Keywords.Filter.MComparator.Equal, value);
			const valNum = this.checkIsNumber(Keywords.Filter.MComparator.Equal, filterVal);
			return filter.equals(valNum, columnKey);
		} else if (key === Keywords.Filter.MComparator.GreaterThan) {
			const [columnKey, filterVal] = this.checkKey(Keywords.Filter.MComparator.GreaterThan, value);
			const valNum = this.checkIsNumber(Keywords.Filter.MComparator.GreaterThan, filterVal);
			return filter.greaterThan(valNum, columnKey);
		} else if (key === Keywords.Filter.MComparator.LessThan) {
			const [columnKey, filterVal] = this.checkKey(Keywords.Filter.MComparator.LessThan, value);
			const valNum = this.checkIsNumber(Keywords.Filter.MComparator.LessThan, filterVal);
			return filter.lessThan(valNum, columnKey);
		} else if (key === Keywords.Filter.Negation.Not) {
			return filter.not(QueryEngine.checkSingleFilter(filter, value));
		} else if (key === Keywords.Filter.SComparator.Is) {
			const [columnKey, filterVal] = this.checkKey(Keywords.Filter.SComparator.Is, value);
			const valStr = this.checkIsString(Keywords.Filter.SComparator.Is, filterVal);
			return filter.is(valStr, columnKey);
		} else {
			throw new InsightError("Filter key not recognized: " + key);
		}
	}

	/**
	 *
	 * @param type the key type checking under (ie. Keywords.Filter.MComparator.Equal)
	 * @param bodyRaw the raw body under this key (ie. { "key": "value" })
	 * @returns a tuple of the parsed key and value
	 */
	private static checkKey(type: string, bodyRaw: unknown): [InsightFacadeKey, unknown] {
		// Ensure child is an object
		const keyBody = QueryEngine.checkIsObject(type, bodyRaw);
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
		} else if (DatasetUtils.isMKey(key)) {
			return [key, keyValue];
		} else if (DatasetUtils.isSKey(key)) {
			return [key, keyValue];
		} else {
			throw new InsightError("Unexpected key type: " + type + ", " + bodyEntries[0][0]);
		}
	}

	/**
	 * Checks whether the given num is a number, and throws an error identified with
	 * section when it is not.
	 *
	 * @param section the name of the number
	 * @param str the variable to test
	 * @returns num as a number
	 * @throws InsightError if num is not an number
	 */
	private static checkIsNumber(section: string, num: unknown): number {
		if (typeof num !== "number") {
			throw new InsightError("Query improperly formed: " + section + " must be a number, not: " + typeof num + ".");
		}
		return num as number;
	}

	/**
	 * Checks whether the given str is a string, and throws an error identified with
	 * section when it is not.
	 *
	 * @param section the name of the string
	 * @param str the variable to test
	 * @returns str as a string
	 * @throws InsightError if str is not an string
	 */
	private static checkIsString(section: string, str: unknown): string {
		if (typeof str !== "string") {
			throw new InsightError("Query improperly formed: " + section + " must be a string, not: " + typeof str + ".");
		}
		return str as string;
	}

	/**
	 * Checks whether the given arr is an array, and throws an error identified with
	 * section when it is not.
	 *
	 * @param section the name of the array
	 * @param arr the variable to test
	 * @returns arr as an array
	 * @throws InsightError if arr is not an array
	 */
	public static checkIsArray(section: string, arr: unknown): unknown[] {
		if (!Array.isArray(arr)) {
			throw new InsightError("Query improperly formed: " + section + " must be an array, not: " + typeof arr + ".");
		}
		return arr as unknown[];
	}

	/**
	 * Checks whether given obj is an object, and throws an error identified with
	 * section when it is not.
	 *
	 * @param section the name of the object
	 * @param obj the variable to test
	 * @returns obj as an object
	 * @throws InsightError if obj is not an object.
	 */
	public static checkIsObject(section: string, obj: unknown): object {
		if (typeof obj !== "object") {
			throw new InsightError("Query improperly formed: " + section + " must be an object, not: " + typeof obj + ".");
		}
		return obj as object;
	}

	/**
	 * Ensures object is populated with only the given keys and returns a map
	 * between keys and their values in the object. Keys are paried with boolean indicating
	 * whether they are mandatory or not. If they are not mandatory and not found, function
	 * will not throw.
	 *
	 * @param obj object to check
	 * @param keys keys in object to retrieve paired with whether they are mandatory
	 * @throws InsighError if key match isn't exact (extra or missing keys)
	 */
	public static requireKeys(obj: object, keys: [string, boolean][]): Map<string, unknown> {
		// Check for extra keys
		const keyFound: boolean[] = Array.of(...keys).map(() => false);
		Object.getOwnPropertyNames(obj).forEach((key, index) => {
			if (keys.find((pair) => pair[0] === key) !== undefined) {
				keyFound[index] = true;
			} else {
				throw new InsightError("Extraneous key: " + key + ".");
			}
		});
		// Check for missing keys
		let missingKeys: string[] = [];
		keys.forEach((pair, index) => {
			if (pair[1] && !keyFound[index]) {
				missingKeys = missingKeys.concat(pair[0]);
			}
		});
		if (missingKeys.length !== 0) {
			throw new InsightError("Missing key(s): " + JSON.stringify(missingKeys) + ".");
		}

		// Map keys to values in object
		const keyValueMap = new Map<string, unknown>();
		keys.forEach((key, index) => {
			if (keyFound[index]) {
				keyValueMap.set(key[0], obj[key[0] as keyof typeof obj]);
			}
		});
		return keyValueMap;
	}
}

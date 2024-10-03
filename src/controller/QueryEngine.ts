import { Section, DatasetList, DatasetsProvider, DatasetUtils, InsightFacadeKey, Dataset } from "./Dataset";
import { InsightError } from "./IInsightFacade";

const Keywords = {
	Body: "WHERE",
	Options: "OPTIONS",
	Filter: {
		Logic: {
			And: "AND",
			Or: "OR",
		},
		MComparator: {
			LessThan: "LT",
			GreaterThan: "GT",
			Equal: "EQ",
		},
		SComparator: {
			Is: "IS",
		},
		Negation: {
			Not: "NOT",
		},
	},
	Columns: "COLUMNS",
	Order: "ORDER",
};

interface OptionsState {
	order: InsightFacadeKey | undefined;
	columns: InsightFacadeKey[];
	datasetId: string;
}

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
	async processQuery(queryRaw: unknown): Promise<Array<Section>> {
		// Ensure query is obect and update type
		const query = QueryEngine.checkIsObject("Query", queryRaw);

		// Ensure only keys are body and options
		const rootStructure = QueryEngine.requireKeys(query, [
			[Keywords.Options, true],
			[Keywords.Body, true],
		]);

		// Split into processing body and options
		const options = this.processOptions(rootStructure.get(Keywords.Options));
		this.processBody(rootStructure.get(Keywords.Body), options);

		return [];
	}

	/**
	 * @param query query object to take body from.
	 * @throws InsightError if options are malformed.
	 */
	processOptions(optionsRaw: unknown): OptionsState {
		// Retrieve options and ensure it is JSON
		const options = QueryEngine.checkIsObject(Keywords.Options, optionsRaw);

		// Break down by property name
		const optionsStructure = QueryEngine.requireKeys(options, [
			[Keywords.Columns, true],
			[Keywords.Order, false],
		]);

		let orderForState: InsightFacadeKey | undefined;
		let columnsForState: InsightFacadeKey[] = [];
		let datasetIdForState: string | undefined;

		// Process columns key list
		const columns = QueryEngine.checkIsArray(Keywords.Columns, optionsStructure.get(Keywords.Columns));
		columns.forEach((columnRaw) => {
			// Ensure column key has proper formatting
			const column = QueryEngine.checkIsString(Keywords.Columns, columnRaw);
			const columnKey = DatasetUtils.parseMOrSKey(column);
			if (columnKey === undefined) throw new InsightError("Improper column key formatting: " + column + ".");
			// Ensure multiple datasets not used in column keys
			if (datasetIdForState !== undefined && datasetIdForState !== columnKey.idstring)
				throw new InsightError("Multiple datasets used in query. Only one allowed.");
			else datasetIdForState = columnKey.idstring;
			columnsForState = columnsForState.concat(columnKey);
		});

		// Query must have columns selected
		if (datasetIdForState === undefined) throw new InsightError("Query must select at least one column.");

		// Process order
		if (optionsStructure.has(Keywords.Order) && optionsStructure.get(Keywords.Order) !== undefined) {
			const order = QueryEngine.checkIsString(Keywords.Order, optionsStructure.get(Keywords.Order));
			const orderKey = DatasetUtils.parseMOrSKey(order);
			if (orderKey !== undefined) {
				orderForState = orderKey;
				if (orderKey.idstring !== datasetIdForState)
					throw new InsightError("Mutliple datasets used in query. Only one allowed.");
			} else throw new InsightError("Order is not a valid ID string: " + order + ".");
		}

		return {
			columns: columnsForState,
			order: orderForState,
			datasetId: datasetIdForState,
		};
	}

	/**
	 *
	 * @param query query object to take body from.
	 * @param options the options state computed
	 * @throws InsightError if body is malformed.
	 */
	processBody(bodyRaw: unknown, options: OptionsState) {
		const filter = new Filter(this.datasets, options);

		QueryEngine.checkSingleFilter(filter, bodyRaw);
	}

	static checkSingleFilter(filter: Filter, bodyRaw: unknown): FilterOperation {
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
		if (mappedKeys.size > 1)
			throw new InsightError("Can only have 1 filter applied here: " + JSON.stringify(mappedKeys) + ".");

		let filterOp = filter.all();

		// This will run 1 or 0 times
		mappedKeys.forEach((value, key) => {
			// TODO
			if (key === Keywords.Filter.Logic.And) {
				const array = QueryEngine.checkIsArray(Keywords.Filter.Logic.And, value);
				filterOp = filter.and(array.map((elem) => QueryEngine.checkSingleFilter(filter, elem)));
			} else if (key === Keywords.Filter.Logic.Or) {
				const array = QueryEngine.checkIsArray(Keywords.Filter.Logic.And, value);
				filterOp = filter.or(array.map((elem) => QueryEngine.checkSingleFilter(filter, elem)));
			} else if (key === Keywords.Filter.MComparator.Equal) {
				// TODO
			} else if (key === Keywords.Filter.MComparator.GreaterThan) {
				// TODO
			} else if (key === Keywords.Filter.MComparator.LessThan) {
				// TODO
			} else if (key === Keywords.Filter.Negation.Not) {
				filterOp = filter.not(QueryEngine.checkSingleFilter(filter, value));
			} else if (key === Keywords.Filter.SComparator.Is) {
				// TODO
			}
		});

		return filterOp;
	}

	/**
	 * Checks whether the given arr is a string, and throws an error identified with
	 * section when it is not.
	 *
	 * @param section the name of the array
	 * @param str the variable to test
	 * @returns str as a string
	 * @throws InsightError if str is not an string
	 */
	static checkIsString(section: string, str: unknown): string {
		if (typeof str !== "string")
			throw new InsightError("Query improperly formed: " + section + " must be a string, not: " + typeof str + ".");

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
	static checkIsArray(section: string, arr: unknown): Array<unknown> {
		if (!Array.isArray(arr))
			throw new InsightError("Query improperly formed: " + section + " must be an array, not: " + typeof arr + ".");

		return arr as Array<unknown>;
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
	static checkIsObject(section: string, obj: unknown): object {
		if (typeof obj !== "object")
			throw new InsightError("Query improperly formed: " + section + " must be an object, not: " + typeof obj + ".");

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
	static requireKeys(obj: object, keys: Array<[string, boolean]>): Map<string, unknown> {
		// Check for extra keys
		const keyFound: Array<boolean> = Array.of(...keys).map(() => false);
		Object.getOwnPropertyNames(obj).forEach((key, index) => {
			if (keys.find((pair) => pair[0] === key) !== undefined) {
				keyFound[index] = true;
			} else throw new InsightError("Extraneous key: " + key + ".");
		});
		// Check for missing keys
		let missingKeys: Array<string> = [];
		keys.forEach((pair, index) => {
			if (pair[1] && !keyFound[index]) missingKeys = missingKeys.concat(pair[0]);
		});
		if (missingKeys.length !== 0) throw new InsightError("Missing key(s): " + JSON.stringify(missingKeys) + ".");

		// Map keys to values in object
		const keyValueMap = new Map<string, unknown>();
		keys.forEach((key, index) => {
			if (keyFound[index]) keyValueMap.set(key[0], obj[key[0] as keyof typeof obj]);
		});
		return keyValueMap;
	}
}

type FilterOperation = () => Array<Section>;

class Filter {
	private readonly options: OptionsState;
	private dataset: Dataset;

	constructor(dp: DatasetsProvider, options: OptionsState) {
		this.options = options;
		const dataset = DatasetUtils.findDataset(dp, options.datasetId);
		if (dataset === undefined) throw new InsightError("Could not find dataset with id: " + options.datasetId + ".");
		this.dataset = dataset;
	}

	or = (children: FilterOperation[]) => () => {
		const resultSet = new Set<Section>();
		children.map((child) => child()).forEach((sectionList) => sectionList.forEach((section) => resultSet.add(section)));
		return Array.from(resultSet);
	};

	and = (children: FilterOperation[]) => () => {
		const resultSet = new Set<Section>();
		const childResults = children.map((child) => child());
		for (let i = 0; i < childResults.length; ++i) {
			if (i == 0) {
				childResults[i].forEach((section) => resultSet.add(section));
			} else {
				childResults[i].forEach((section) => {
					if (!resultSet.has(section)) resultSet.delete(section);
				});
			}
		}
		return Array.from(resultSet);
	};

	mOperation = (compare: (x: number, y: number) => boolean, limit: number, mkey: InsightFacadeKey) => () => {
		let ret: Array<Section> = [];
		this.dataset.members.forEach((section) => {
			if (compare(section[mkey.field as keyof Section] as number, limit)) ret = ret.concat(section);
		});
		return ret;
	};

	lessThan = (limit: number, mkey: InsightFacadeKey) => this.mOperation((x, y) => x < y, limit, mkey);
	greaterThan = (limit: number, mkey: InsightFacadeKey) => this.mOperation((x, y) => x > y, limit, mkey);
	equals = (limit: number, mkey: InsightFacadeKey) => this.mOperation((x, y) => x === y, limit, mkey);

	is = (compare: string, skey: InsightFacadeKey) => () => {
		let ret: Array<Section> = [];
		this.dataset.members.forEach((section) => {
			if ((section[skey.field as keyof Section] as string) === compare) ret = ret.concat(section);
		});
		return ret;
	};

	not = (child: FilterOperation) => () => {
		const childSet = new Set<Section>();
		let result: Section[] = [];
		child().forEach((section) => childSet.add(section));
		this.dataset.members.forEach((section) => {
			if (!childSet.has(section)) result = result.concat(section);
		});
		return result;
	};

	/**
	 *
	 * @returns a function returning everything in the dataset
	 */
	all = () => () => this.dataset.members;
}

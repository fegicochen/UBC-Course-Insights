import { Section, DatasetList, DatasetsProvider } from "./Dataset";
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
		this.processOptions(rootStructure.get(Keywords.Options));
		this.processBody(rootStructure.get(Keywords.Body));

		return [];
	}

	/**
	 * @param query query object to take body from.
	 * @throws InsightError if options are malformed.
	 */
	processOptions(optionsRaw: unknown) {
		// Retrieve options and ensure it is JSON
		const options = QueryEngine.checkIsObject(Keywords.Options, optionsRaw);

		// Break down by property name
		const optionsStructure = QueryEngine.requireKeys(options, [
			[Keywords.Columns, true],
			[Keywords.Order, false],
		]);

		// Process columns key list
		const columns = QueryEngine.checkIsArray(Keywords.Columns, optionsStructure.get(Keywords.Columns));
		// TODO: validate keys and store (list of key)

		// Process order
		// TODO: validate order and store (key)
	}

	/**
	 *
	 * @param query query object to take body from.
	 * @throws InsightError if body is malformed.
	 */
	processBody(bodyRaw: unknown) {
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
		if (mappedKeys.size > 1) throw new InsightError("Can only have 1 root filter applied.");

		// This will run 1 or 0 times
		mappedKeys.forEach((value, key) => {
			// TODO
			if (key === Keywords.Filter.Logic.And) {
			} else if (key === Keywords.Filter.Logic.Or) {
			} else if (key === Keywords.Filter.MComparator.Equal) {
			} else if (key === Keywords.Filter.MComparator.GreaterThan) {
			} else if (key === Keywords.Filter.MComparator.LessThan) {
			} else if (key === Keywords.Filter.Negation.Not) {
			} else if (key === Keywords.Filter.SComparator.Is) {
			}
		});
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
			if (!missingKeys[index]) keyValueMap.set(key[0], obj[key[0] as keyof typeof obj]);
		});
		return keyValueMap;
	}
}

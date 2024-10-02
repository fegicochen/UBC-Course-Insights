import { Section, DatasetList, DatasetsProvider } from "./Dataset";
import { InsightError } from "./IInsightFacade";

const Keywords = {
	Body: "WHERE",
	Options: "OPTIONS",
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
	async performQuery(query: unknown): Promise<Array<Section>> {
		// Ensure query is obect and update type
		this.checkValidJSON("Query", query);
		query = query as object;

		// Split into processing body and options

		return [];
	}

	/**
	 * Checks whether given query is an object, and throws an error identified with
	 * section when it is not.
	 *
	 * @param section the name of the object
	 * @param obj the variable to test
	 * @throws InsightError of query is not an object.
	 */
	checkValidJSON(section: string, obj: unknown) {
		if (typeof obj !== "object") throw new InsightError(section + " must be an object, not: " + typeof obj + ".");
	}

	/**
	 *
	 * @param query query object to take body from.
	 * @throws InsightError if body is malformed.
	 */
	processBody(query: object) {
		// Check that query has body indicator key
		if (!(Keywords.Body in query)) throw new InsightError("Query improperly formed: missing " + Keywords.Body + ".");

		// Retrieve body and ensure it is JSON
		let body: unknown = query[Keywords.Body as keyof typeof query];
		this.checkValidJSON(Keywords.Body, body);
		body = body as object;

		// Break down body by components
	}
}

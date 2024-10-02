import { Section, DatasetList, DatasetsProvider } from "./Dataset";
import { InsightError } from "./IInsightFacade";

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
	performQuery(query: unknown): Array<Section> {
		this.checkValidJSON(query);

		return [];
	}

	/**
	 * Checks whether given query is an object.
	 *
	 * @param query the query object
	 * @throws InsightError of query is not an object.
	 */
	checkValidJSON(query: unknown) {
		if (typeof query !== "object") throw new InsightError("Query must be an object, not: " + typeof query + ".");
	}
}

import { Dataset, DatasetList, DatasetUtils } from "./Dataset";
import { IInsightFacade, InsightDataset, InsightDatasetKind, InsightError, InsightResult } from "./IInsightFacade";
import { QueryEngine } from "./QueryEngine";
import DatasetProcessor from "../../src/controller/DatasetProcessor";

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 *
 */
export default class InsightFacade implements IInsightFacade {
	private datasets: DatasetList;

	constructor() {
		// TODO: Load datasets from dist
		this.datasets = { datasets: [] };
	}

	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {
		// Check id valid
		if (!DatasetUtils.isValidIdString(id)) {
			throw new InsightError("Invalid dataset ID: " + id + ".");
		}

		// Check for duplicate ID
		if (this.datasets.datasets.find((dataset) => dataset.id === id)) {
			throw new InsightError("Duplicate ID: " + id);
		}

		// Check kind
		if (kind === InsightDatasetKind.Sections) {
			const validSections = await DatasetProcessor.getValidSections(content);
			const dataset: Dataset = { id: id, members: validSections };
			this.datasets.datasets.push(dataset);
		} else {
			throw new InsightError("InsightDatasetKind.Rooms not supported yet.");
		}

		// Return list of valid datasets
		return this.datasets.datasets.map((dataset) => dataset.id);
	}

	public async removeDataset(id: string): Promise<string> {
		// TODO: Remove this once you implement the methods!
		throw new Error(`InsightFacadeImpl::removeDataset() is unimplemented! - id=${id};`);
	}

	public async performQuery(query: unknown): Promise<InsightResult[]> {
		const qe = new QueryEngine(() => this.datasets);
		const sections = await qe.processQuery(query);
		return sections;
	}

	public async listDatasets(): Promise<InsightDataset[]> {
		return this.datasets.datasets.map((dataset) => ({
			id: dataset.id,
			kind: InsightDatasetKind.Sections,
			numRows: dataset.members.length,
		}));
	}
}

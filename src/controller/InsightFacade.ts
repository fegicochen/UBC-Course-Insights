import JSZip, { file } from "jszip";
import { DatasetList, DatasetUtils } from "./Dataset";
import { IInsightFacade, InsightDataset, InsightDatasetKind, InsightError, InsightResult } from "./IInsightFacade";
import { QueryEngine } from "./QueryEngine";

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

	private getDatasets(): DatasetList {
		return this.datasets;
	}

	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {
		// Check id valid
		if (!DatasetUtils.isValidIdString(id)) throw new InsightError("Invalid dataset ID: " + id + ".");

		// Check for duplicate ID
		if (this.datasets.datasets.find((dataset) => dataset.id === id)) throw new InsightError("Duplicate ID: " + id);

		// Check kind
		if (kind === InsightDatasetKind.Sections) {
			// Verify content is base64
			if (!DatasetUtils.isValidBase64(content)) throw new InsightError("File content is not valid base64.");

			// Unzip content with JSZip
			const zip = await new JSZip().loadAsync(content, { base64: true });

			// Go through files
			Object.entries(zip.files).forEach((entry) => {
				const fileName = entry[0];
				const fileData = entry[1];
				// TODO: Fegico
				throw new Error(fileName + ": " + JSON.stringify(fileData));
			});
		} else throw new InsightError("InsightDatasetKind.Rooms not supported yet.");

		// Return list of valid datasets
		return this.datasets.datasets.map((dataset) => dataset.id);
	}

	public async removeDataset(id: string): Promise<string> {
		// TODO: Remove this once you implement the methods!
		throw new Error(`InsightFacadeImpl::removeDataset() is unimplemented! - id=${id};`);
	}

	public async performQuery(query: unknown): Promise<InsightResult[]> {
		// TODO: replace datasets provider with actual provider.
		const qe = new QueryEngine(this.getDatasets);
		const sections = await qe.processQuery(query);
		return sections as unknown as InsightResult[];
	}

	public async listDatasets(): Promise<InsightDataset[]> {
		// TODO: Remove this once you implement the methods!
		throw new Error(`InsightFacadeImpl::listDatasets is unimplemented!`);
	}
}

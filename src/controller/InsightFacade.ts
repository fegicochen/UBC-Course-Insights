import { Dataset, DatasetList, DatasetUtils } from "./Dataset";
import {
	IInsightFacade,
	InsightDataset,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
} from "./IInsightFacade";
import { QueryEngine } from "./QueryEngine";
import DatasetProcessor from "../../src/controller/DatasetProcessor";
import { mkdir, pathExists, readJSON, writeJSON } from "fs-extra";

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 *
 */
export default class InsightFacade implements IInsightFacade {
	private datasets: DatasetList;
	private loadedData;

	constructor() {
		// TODO: Load datasets from dist
		this.loadedData = false;
		this.datasets = { datasets: [] };
	}

	private async loadDataIfRequired(): Promise<void> {
		if (this.loadedData) {
			return;
		}
		try {
			if (await pathExists("data/datasets.json")) {
				const pkgObj = await readJSON("data/datasets.json");
				this.datasets = pkgObj as DatasetList;
			}
			this.loadedData = true;
		} catch (e) {
			throw new InsightError("Failed to read data from disc: " + JSON.stringify(e));
		}
	}

	private async writeData(): Promise<void> {
		try {
			if (!(await pathExists("data"))) {
				try {
					await mkdir("data");
				} catch (_e) {
					// Its fine
				}
			}
			await writeJSON("data/datasets.json", this.datasets);
		} catch (e) {
			throw new InsightError("Failed to write data to disc: " + JSON.stringify(e));
		}
	}

	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {
		await this.loadDataIfRequired();
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

		// Save to disc
		await this.writeData();

		// Return list of valid datasets
		return this.datasets.datasets.map((dataset) => dataset.id);
	}

	public async removeDataset(id: string): Promise<string> {
		await this.loadDataIfRequired();

		if (!DatasetUtils.isValidIdString(id)) {
			throw new InsightError("Invalid id: " + id);
		}
		const newDatasets: Dataset[] = [];
		this.datasets.datasets.forEach((dataset) => {
			if (dataset.id !== id) {
				newDatasets.push(dataset);
			}
		});
		if (this.datasets.datasets.length === newDatasets.length) {
			throw new NotFoundError("Dataset with id " + id + " not found.");
		}
		this.datasets.datasets = newDatasets;

		// Save to disc
		await this.writeData();

		return id;
	}

	public async performQuery(query: unknown): Promise<InsightResult[]> {
		await this.loadDataIfRequired();
		const qe = new QueryEngine(() => this.datasets);
		const sections = await qe.processQuery(query);
		return sections;
	}

	public async listDatasets(): Promise<InsightDataset[]> {
		await this.loadDataIfRequired();
		return this.datasets.datasets.map((dataset) => ({
			id: dataset.id,
			kind: InsightDatasetKind.Sections,
			numRows: dataset.members.length,
		}));
	}
}

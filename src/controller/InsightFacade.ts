import { SectionsDataset, DatasetUtils, RoomsDataset } from "./Dataset";
import {
	IInsightFacade,
	InsightDataset,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
} from "./IInsightFacade";
import { QueryEngine } from "./QueryEngine";
import PersistantData from "./PersistantData";
import SectionsDatasetProcessor from "./SectionsDatasetProcessor";
import { RoomsDatasetProcessor } from "./RoomsDatasetProcessor";

/**
 * This is the main programmatic entry point for the project.
 * Method documentation is in IInsightFacade
 *
 */
export default class InsightFacade implements IInsightFacade {
	private data: PersistantData;

	constructor() {
		this.data = new PersistantData();
	}

	public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<string[]> {
		// Check id valid
		if (!DatasetUtils.isValidIdString(id)) {
			throw new InsightError("Invalid dataset ID: " + id + ".");
		}

		// Check for duplicate ID
		if ((await this.data.getDatasets()).sections.find((dataset) => dataset.id === id)) {
			throw new InsightError("Duplicate ID: " + id);
		}

		// Check kind
		if (kind === InsightDatasetKind.Sections) {
			const validSections = await SectionsDatasetProcessor.getValidSections(content);
			const dataset: SectionsDataset = { id: id, members: validSections, type: InsightDatasetKind.Sections };
			await this.data.addSectionsDataset(dataset);
		} else {
			const validRooms = await RoomsDatasetProcessor.getValidRooms(content);
			const dataset: RoomsDataset = { id: id, members: validRooms, type: InsightDatasetKind.Rooms };
			await this.data.addRoomsDataset(dataset);
		}

		// Save to disc
		await this.data.writeData();

		// Return list of valid datasets
		return DatasetUtils.getAllIDs(await this.data.getDatasets());
	}

	public async removeDataset(id: string): Promise<string> {
		if (!DatasetUtils.isValidIdString(id)) {
			throw new InsightError("Invalid id: " + id);
		}
		const newSections: SectionsDataset[] = [];
		const newRooms: RoomsDataset[] = [];
		const datasets = await this.data.getDatasets();
		datasets.sections.forEach((dataset) => {
			if (dataset.id !== id) {
				newSections.push(dataset);
			}
		});
		datasets.rooms.forEach((dataset) => {
			if (dataset.id !== id) {
				newRooms.push(dataset);
			}
		});
		if ((await this.data.getDatasets()).sections.length === newSections.length) {
			throw new NotFoundError("Dataset with id " + id + " not found.");
		}
		await this.data.setDatasets({ sections: newSections, rooms: newRooms });

		// Save to disc
		await this.data.writeData();

		return id;
	}

	public async performQuery(query: unknown): Promise<InsightResult[]> {
		const datasets = await this.data.getDatasets();
		const qe = new QueryEngine(() => datasets);
		const sections = await qe.processQuery(query);
		return sections;
	}

	public async listDatasets(): Promise<InsightDataset[]> {
		return DatasetUtils.combineDatasets(await this.data.getDatasets()).map((dataset) => ({
			id: dataset.id,
			kind: dataset.type,
			numRows: dataset.members.length,
		}));
	}
}

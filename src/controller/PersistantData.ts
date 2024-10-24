import { mkdir, pathExists, readJSON, writeJSON } from "fs-extra";
import { SectionsDataset, DatasetList, RoomsDataset } from "./Dataset";
import { InsightError } from "./IInsightFacade";

const dataDir = "data";
const writePath = dataDir + "/data.json";

export default class PersistantData {
	private loadedData: boolean;
	private datasets: DatasetList;

	constructor() {
		this.loadedData = false;
		this.datasets = { sections: [], rooms: [] };
	}

	public async getDatasets(): Promise<DatasetList> {
		await this.loadDataIfRequired();
		return this.datasets!!;
	}

	public async addSectionsDataset(dataset: SectionsDataset): Promise<void> {
		this.datasets.sections.push(dataset);
	}

	public async addRoomsDataset(dataset: RoomsDataset): Promise<void> {
		this.datasets.rooms.push(dataset);
	}

	public async setDatasets(datasets: DatasetList): Promise<void> {
		this.datasets = datasets;
	}

	private async loadDataIfRequired(): Promise<void> {
		if (this.loadedData) {
			return;
		}
		try {
			if (await pathExists(writePath)) {
				const pkgObj = await readJSON(writePath);
				this.datasets = pkgObj as DatasetList;
			}
			this.loadedData = true;
		} catch (e) {
			throw new InsightError("Failed to read data from disc: " + JSON.stringify(e));
		}
	}

	public async writeData(): Promise<void> {
		try {
			if (!(await pathExists(dataDir))) {
				try {
					await mkdir(dataDir);
				} catch (_e) {
					// Its fine
				}
			}
			await writeJSON(writePath, this.datasets);
		} catch (e) {
			throw new InsightError("Failed to write data to disc: " + JSON.stringify(e));
		}
	}
}

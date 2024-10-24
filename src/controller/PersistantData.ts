import { mkdir, pathExists, readJSON, writeJSON } from "fs-extra";
import { SectionDataset, DatasetList } from "./Dataset";
import { InsightError } from "./IInsightFacade";

const dataDir = "data";
const sectionsWritePath = dataDir + "/sections.json";
// TODO: data persistance for rooms
// const roomsWritePath = dataDir + "/rooms.json";

export default class PersistantData {
	private loadedData: boolean;
	private datasets: DatasetList | undefined;

	constructor() {
		this.loadedData = false;
		this.datasets = undefined;
	}

	public async getDatasets(): Promise<DatasetList> {
		await this.loadDataIfRequired();
		return this.datasets!!;
	}

	public async addDataset(dataset: SectionDataset): Promise<void> {
		this.datasets?.sections.push(dataset);
	}

	public async setDatasets(datasets: DatasetList): Promise<void> {
		this.datasets = datasets;
	}

	private async loadDataIfRequired(): Promise<void> {
		if (this.loadedData) {
			return;
		}
		try {
			if (await pathExists(sectionsWritePath)) {
				const pkgObj = await readJSON(sectionsWritePath);
				this.datasets = pkgObj as DatasetList;
			}
			this.loadedData = true;
			this.datasets = { sections: [], rooms: [] };
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
			await writeJSON(sectionsWritePath, this.datasets);
		} catch (e) {
			throw new InsightError("Failed to write data to disc: " + JSON.stringify(e));
		}
	}
}

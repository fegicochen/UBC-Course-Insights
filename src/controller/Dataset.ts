enum DatasetId {
	uuid = "id",
	id = "Course",
	title = "Title",
	instructor = "Professor",
	dept = "Subject",
	year = "Year",
	avg = "Avg",
	pass = "Pass",
	fail = "Fail",
	audit = "Audit",
}

export interface Section {
	uuid: string;
	id: string;
	title: string;
	instructor: string;
	dept: string;
	year: number;
	avg: number;
	pass: number;
	fail: number;
	audit: number;
}

export interface Dataset {
	id: string;
	members: Array<Section>;
}

export interface DatasetList {
	datasets: Array<Dataset>;
}

export type DatasetsProvider = () => DatasetList;
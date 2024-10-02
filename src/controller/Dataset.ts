import { InsightError } from "./IInsightFacade";

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

export class Utils {
	/**
	 * Throws InsightError if idstring does not conform to id string guidelines.
	 *
	 * @param idstring string to test
	 * @returns false if string is improperly formatted (only whitespace or contains underscoare), true otherwise
	 */
	static isValidIdString(idstring: string): boolean {
		if (idstring.trim() === "" || idstring.includes("_")) return false;
		return true;
	}
}

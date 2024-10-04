export enum DatasetId {
	Uuid = "uuid",
	Id = "id",
	Title = "title",
	Instructor = "instructor",
	Dept = "dept",
	Year = "year",
	Avg = "avg",
	Pass = "pass",
	Fail = "fail",
	Audit = "audit",
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
	members: Section[];
}

export interface DatasetList {
	datasets: Dataset[];
}

export type DatasetsProvider = () => DatasetList;

export const MFields = [DatasetId.Avg, DatasetId.Pass, DatasetId.Fail, DatasetId.Audit, DatasetId.Year];
export const SFields = [DatasetId.Dept, DatasetId.Id, DatasetId.Instructor, DatasetId.Title, DatasetId.Uuid];

export interface InsightFacadeKey {
	idstring: string;
	field: DatasetId;
}

export class DatasetUtils {
	/**
	 *
	 * @param base64 the base64 (maybe) string to validate
	 * @returns whether it is base64 formatted or not
	 */
	public static isValidBase64(base64: string): boolean {
		// Referenced from: https://stackoverflow.com/questions/7860392/determine-if-string-is-in-base64-using-javascript
		// Used the regular expression provided.
		const base64regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
		return base64regex.test(base64);
	}

	/**
	 *
	 * @param provider datasets provider
	 * @param id id to search for
	 * @returns undefined if not found, else the dataset with the given id
	 */
	public static findDataset(provider: DatasetsProvider, id: string): Dataset | undefined {
		const datasets = provider();
		return datasets.datasets.find((dataset) => dataset.id === id);
	}

	/**
	 * Returns false if idstring does not conform to id string guidelines.
	 *
	 * @param idstring string to test
	 * @returns false if string is improperly formatted (only whitespace or contains underscoare), true otherwise
	 */
	public static isValidIdString(idstring: string): boolean {
		if (idstring.trim() === "" || idstring.includes("_")) {
			return false;
		}
		return true;
	}

	/**
	 *
	 * @param key string to test
	 * @returns undefined if string is improperly formatted as an mkey, id string and key split if it is valid.
	 */
	public static parseMKey(key: string): InsightFacadeKey | undefined {
		const splitUnderscore = key.split("_");
		const beforeAndAfterUnderscoreLength = 2;
		if (splitUnderscore.length !== beforeAndAfterUnderscoreLength) {
			return undefined;
		}
		const idstring = splitUnderscore[0],
			mfield = splitUnderscore[1];
		if (!this.isValidIdString(idstring) || !MFields.find((x) => x === mfield)) {
			return undefined;
		}
		return {
			idstring: idstring,
			field: mfield as DatasetId,
		};
	}

	/**
	 *
	 * @param key string to test
	 * @returns undefined if string is improperly formatted as an skey, id string and key split if it is valid.
	 */
	public static parseSKey(key: string): InsightFacadeKey | undefined {
		const splitUnderscore = key.split("_");
		const beforeAndAfterUnderscoreLength = 2;
		if (splitUnderscore.length !== beforeAndAfterUnderscoreLength) {
			return undefined;
		}
		const idstring = splitUnderscore[0],
			sfield = splitUnderscore[1];
		if (!this.isValidIdString(idstring) || !SFields.find((x) => x === sfield)) {
			return undefined;
		}
		return {
			idstring: idstring,
			field: sfield as DatasetId,
		};
	}

	/**
	 *
	 * @param key string to test
	 * @reutrns undefined if string is not an mkey or skey, otherwise produces id string and key split.
	 */
	public static parseMOrSKey(key: string): InsightFacadeKey | undefined {
		const mkeyParse = this.parseMKey(key);
		if (mkeyParse !== undefined) {
			return mkeyParse;
		} else {
			return this.parseSKey(key);
		}
	}

	/**
	 *
	 * @param key key to test with idstring and field
	 * @returns whether it is an mkey or not
	 */
	public static isMKey(key: InsightFacadeKey): boolean {
		return MFields.find((x) => x === key.field) !== undefined;
	}

	/**
	 *
	 * @param key key to test with idstring and field
	 * @returns whether it is an skey or not
	 */
	public static isSKey(key: InsightFacadeKey): boolean {
		return SFields.find((x) => x === key.field) !== undefined;
	}
}

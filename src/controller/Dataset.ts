import JSZip from "jszip";
import { InsightDatasetKind, InsightError } from "./IInsightFacade";

export const maxResults = 5000;

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

export interface Room {
	fullname: string;
	shortname: string;
	number: string;
	name: string;
	address: string;
	lat: number;
	lon: number;
	seats: number;
	type: string;
	furniture: StorageManager;
	href: string;
}

export interface Dataset<T> {
	id: string;
	members: T[];
	type: InsightDatasetKind;
}

export type SectionsDataset = Dataset<Section>;
export type RoomsDataset = Dataset<Room>;

export interface DatasetList {
	sections: SectionsDataset[];
	rooms: RoomsDataset[];
}

export type DatasetsProvider = () => DatasetList;

export const MFields = [DatasetId.Avg, DatasetId.Pass, DatasetId.Fail, DatasetId.Audit, DatasetId.Year];
export const SFields = [DatasetId.Dept, DatasetId.Id, DatasetId.Instructor, DatasetId.Title, DatasetId.Uuid];

export interface InsightFacadeKey {
	idstring: string;
	field: DatasetId;
}

export const Keywords = {
	Body: "WHERE",
	Options: "OPTIONS",
	Filter: {
		Logic: {
			And: "AND",
			Or: "OR",
		},
		MComparator: {
			LessThan: "LT",
			GreaterThan: "GT",
			Equal: "EQ",
		},
		SComparator: {
			Is: "IS",
		},
		Negation: {
			Not: "NOT",
		},
	},
	Columns: "COLUMNS",
	Order: "ORDER",
};

export interface OptionsState {
	order: InsightFacadeKey | undefined;
	columns: InsightFacadeKey[];
	datasetId: string;
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
	public static findDataset(provider: DatasetsProvider, id: string): SectionsDataset | undefined {
		const datasets = provider();
		return datasets.sections.find((dataset) => dataset.id === id);
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
	 * @param key key to test with idstring and field or string representing type (DatasetId.Audit etc)
	 * @returns whether it is an mkey or not
	 */
	public static isMKey(key: InsightFacadeKey | string | undefined): boolean {
		if (key === undefined) {
			return false;
		}
		return MFields.find((x) => x === (typeof key === "string" ? key : key.field)) !== undefined;
	}

	/**
	 *
	 * @param key key to test with idstring and field or string representing type (DatasetId.Uuid, etc)
	 * @returns whether it is an skey or not
	 */
	public static isSKey(key: InsightFacadeKey | string | undefined): boolean {
		if (key === undefined) {
			return false;
		}
		return SFields.find((x) => x === (typeof key === "string" ? key : key.field)) !== undefined;
	}

	/**
	 * Ensures object is populated with only the given keys and returns a map
	 * between keys and their values in the object. Keys are paried with boolean indicating
	 * whether they are mandatory or not. If they are not mandatory and not found, function
	 * will not throw.
	 *
	 * @param obj object to check
	 * @param keys keys in object to retrieve paired with whether they are mandatory
	 * @throws InsighError if key match isn't exact (extra or missing keys)
	 */
	public static requireExactKeys(obj: object, keys: [string, boolean][]): Map<string, unknown> {
		// Check for extra keys
		const keysFound = new Set<string>();
		Object.keys(obj).forEach((key) => {
			if (keys.find(([searchKey, _searchKeyRequired]) => searchKey === key) !== undefined) {
				keysFound.add(key);
			} else {
				throw new InsightError("Extraneous key: " + key + ".");
			}
		});
		// Check for missing keys
		let missingKeys: string[] = [];
		keys.forEach(([searchKey, searchKeyRequired]) => {
			// If key is reuqired and it is not found
			if (searchKeyRequired && !keysFound.has(searchKey)) {
				missingKeys = missingKeys.concat(searchKey);
			}
		});
		if (missingKeys.length !== 0) {
			throw new InsightError("Missing key(s): " + JSON.stringify(missingKeys) + ".");
		}

		// Map keys to values in object
		const keyValueMap = new Map<string, unknown>();
		keys.forEach(([searchKey, _searchKeyRequired]) => {
			const value = obj[searchKey as keyof typeof obj];
			if (keysFound.has(searchKey) && value !== undefined) {
				keyValueMap.set(searchKey, value);
			}
		});
		return keyValueMap;
	}

	/**
	 * Ensures object is populated with the given keys. Other keys are ignored. Options keys
	 * are allowed to be there or not.
	 *
	 * @param obj object to check
	 * @param keys keys in object to retrieve paired with whether they are mandatory or not
	 * @throws InsightError if a required key is not found
	 */
	public static requireHasKeys(obj: object, keys: [string, boolean][]): Map<string, unknown> {
		const keyValueMap = new Map<string, unknown>();
		Object.entries(obj).forEach(([key, value]) => {
			const matchedSearchKey = keys.find((k) => k[0] === key);
			if (matchedSearchKey !== undefined) {
				keyValueMap.set(key, value);
			}
		});
		// Ensure keys which are required have been mapped
		keys.forEach((key) => {
			const [keyString, keyRequired] = key;
			if (keyRequired && !keyValueMap.has(keyString)) {
				throw new InsightError("Missing key: " + keyString);
			}
		});
		return keyValueMap;
	}

	/**
	 * Checks whether the given num is a number, and throws an error identified with
	 * section when it is not.
	 *
	 * @param section the name of the number
	 * @param str the variable to test
	 * @returns num as a number
	 * @throws InsightError if num is not an number
	 */
	public static checkIsNumber(section: string, num: unknown): number {
		if (typeof num !== "number") {
			throw new InsightError("JSON format error: " + section + " must be a number, not: " + typeof num + ".");
		}
		return num as number;
	}

	/**
	 * Checks whether the given str is a string, and throws an error identified with
	 * section when it is not.
	 *
	 * @param section the name of the string
	 * @param str the variable to test
	 * @returns str as a string
	 * @throws InsightError if str is not an string
	 */
	public static checkIsString(section: string, str: unknown): string {
		if (typeof str !== "string") {
			throw new InsightError("JSON format error: " + section + " must be a string, not: " + typeof str + ".");
		}
		return str as string;
	}

	/**
	 * Checks whether the given arr is an array, and throws an error identified with
	 * section when it is not.
	 *
	 * @param section the name of the array
	 * @param arr the variable to test
	 * @returns arr as an array
	 * @throws InsightError if arr is not an array
	 */
	public static checkIsArray(section: string, arr: unknown): unknown[] {
		if (!Array.isArray(arr)) {
			throw new InsightError("JSON format error: " + section + " must be an array, not: " + typeof arr + ".");
		}
		return arr as unknown[];
	}

	/**
	 * Checks whether given obj is an object, and throws an error identified with
	 * section when it is not.
	 *
	 * @param section the name of the object
	 * @param obj the variable to test
	 * @returns obj as an object
	 * @throws InsightError if obj is not an object.
	 */
	public static checkIsObject(section: string, obj: unknown): object {
		if (typeof obj !== "object" || Array.isArray(obj) || obj === null || obj === undefined) {
			throw new InsightError("JSON format error: " + section + " must be an object, not: " + typeof obj + ", " + obj);
		}
		return obj as object;
	}

	/**
	 *
	 * @param content base64 content to unzip
	 * @returns a JSZip of the content
	 * @throws InsightError if the content cannot be properly parsed
	 */
	public static async unzipBase64Content(content: string): Promise<JSZip> {
		let unzipped: JSZip;
		try {
			unzipped = await new JSZip().loadAsync(content, { base64: true });
		} catch (e) {
			throw new InsightError("Error parsing content " + e);
		}
		return unzipped;
	}


	/**
	 *
	 * @param datasets datasets to get ids from
	 * @returns all ids in the given datasets
	 */
	public static getAllIDs(datasets: DatasetList): string[] {
		return this.combineDatasets(datasets).map(x => x.id);
	}

	/**
	 *
	 * @param datasets datasets to combine
	 * @returns list of datasets combined
	 */
	public static combineDatasets(datasets: DatasetList): Dataset<Section | Room>[] {
		return (datasets.rooms as Dataset<Section | Room>[]).concat(datasets.sections);
	}
}

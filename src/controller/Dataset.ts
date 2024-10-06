import { InsightError } from "./IInsightFacade";

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
	public static requireKeys(obj: object, keys: [string, boolean][]): Map<string, unknown> {
		// Check for extra keys
		const keyFound: boolean[] = Array.of(...keys).map(() => false);
		Object.getOwnPropertyNames(obj).forEach((key, index) => {
			if (keys.find((pair) => pair[0] === key) !== undefined) {
				keyFound[index] = true;
			} else {
				throw new InsightError("Extraneous key: " + key + ".");
			}
		});
		// Check for missing keys
		let missingKeys: string[] = [];
		keys.forEach((pair, index) => {
			if (pair[1] && !keyFound[index]) {
				missingKeys = missingKeys.concat(pair[0]);
			}
		});
		if (missingKeys.length !== 0) {
			throw new InsightError("Missing key(s): " + JSON.stringify(missingKeys) + ".");
		}

		// Map keys to values in object
		const keyValueMap = new Map<string, unknown>();
		keys.forEach((key, index) => {
			if (keyFound[index]) {
				keyValueMap.set(key[0], obj[key[0] as keyof typeof obj]);
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
			throw new InsightError("Query improperly formed: " + section + " must be a number, not: " + typeof num + ".");
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
			throw new InsightError("Query improperly formed: " + section + " must be a string, not: " + typeof str + ".");
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
			throw new InsightError("Query improperly formed: " + section + " must be an array, not: " + typeof arr + ".");
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
		if (typeof obj !== "object") {
			throw new InsightError("Query improperly formed: " + section + " must be an object, not: " + typeof obj + ".");
		}
		return obj as object;
	}
}

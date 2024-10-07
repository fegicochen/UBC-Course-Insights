import JSZip from "jszip";
import { DatasetId, DatasetUtils, Section } from "./Dataset";
import { InsightError } from "./IInsightFacade";
export default class DatasetProcessor {
	/**
	 *
	 * @param content zip file
	 * @returns Returns the valid sections from zip file
	 */
	public static async getValidSections(content: string): Promise<Section[]> {
		let unzipped;
		try {
			unzipped = await new JSZip().loadAsync(content, { base64: true });
		} catch (e) {
			throw new InsightError("Error parsing content " + e);
		}

		// Check if unzipped file has courses folder
		if (unzipped.folder("courses") === null) {
			throw new InsightError("No courses folder!");
		}

		// Go through files in courses folder
		const courseFiles = Object.values(unzipped.files);
		// Filters for valid JSON files in courses folder
		const validCourseFiles = courseFiles.filter((file) => file.name.startsWith("courses/") && !file.dir);
		// Map over valid files to read content
		const courseFilePromises = validCourseFiles.map(async (file) => {
			const jsonContent = await file.async("string");
			try {
				const parsedData = JSON.parse(jsonContent);
				const parsedDataObject = DatasetUtils.checkIsObject("result", parsedData);
				const resultInMap = DatasetUtils.requireHasKeys(parsedDataObject, [["result", true]]);
				const arrayOfSectionLike = DatasetUtils.checkIsArray("section array", resultInMap.get("result"));
				const sectionArray = arrayOfSectionLike.map((x) => this.checkIsSection(x));
				const sectionFilteredArray = sectionArray.filter((x) => x !== undefined) as Section[];

				return sectionFilteredArray; // Return the valid sections
			} catch (e) {
				throw new InsightError("Failed to parse JSON in file: " + e);
			}
		});
		// Wait for all promises to resolve and flatten the results
		const courseSectionsArrays = await Promise.all(courseFilePromises);
		const sections = courseSectionsArrays.flat();

		// Check if there's at least one valid section
		if (sections.length === 0) {
			throw new InsightError("No valid sections found in content!");
		}

		return sections;
	}

	private static sectionKeys: [string, boolean][] = [
		["id", true],
		["Course", true],
		["Title", true],
		["Professor", true],
		["Subject", true],
		["Year", true],
		["Avg", true],
		["Pass", true],
		["Fail", true],
		["Audit", true],
		["Section", false],
	];

	public static checkIsSection(sectionLike: unknown): Section | undefined {
		try {
			const sectionLikeIsObject = DatasetUtils.checkIsObject("section", sectionLike);
			const map = DatasetUtils.requireHasKeys(sectionLikeIsObject, this.sectionKeys);

			// Check for overall secton
			if (map.has("Section") && map.get("Section") === "overall") {
				const overallSectionYear = 1900;
				map.set("Year", overallSectionYear);
			}
			map.delete("Section");

			const sectionKVP = Array.from(map.entries()).map(([fileKey, val]) => {
				const dsetKey = this.mapFileToDatasetKey(fileKey);
				if (DatasetUtils.isMKey(dsetKey)) {
					let numVal: number;
					try {
						numVal = DatasetUtils.checkIsNumber("section " + dsetKey, val);
					} catch (_e) {
						numVal = Number.parseInt(DatasetUtils.checkIsString("section " + dsetKey, val), 10);
					}
					return [dsetKey, numVal];
				} else if (DatasetUtils.isSKey(dsetKey)) {
					let strVal: string;
					try {
						strVal = DatasetUtils.checkIsString("section " + dsetKey, val);
					} catch (_e) {
						strVal = DatasetUtils.checkIsNumber("section " + dsetKey, val).toString();
					}
					return [dsetKey, strVal];
				} else {
					throw new InsightError("Key value not a number or string");
				}
			});

			return Object.fromEntries(sectionKVP) as Section;
		} catch (_e) {
			return undefined;
		}
	}

	private static mapFileToDatasetKey(fileKey: string): DatasetId {
		const fileToDatasetMap = new Map<string, DatasetId>();
		fileToDatasetMap.set("id", DatasetId.Uuid);
		fileToDatasetMap.set("Course", DatasetId.Id);
		fileToDatasetMap.set("Title", DatasetId.Title);
		fileToDatasetMap.set("Professor", DatasetId.Instructor);
		fileToDatasetMap.set("Subject", DatasetId.Dept);
		fileToDatasetMap.set("Year", DatasetId.Year);
		fileToDatasetMap.set("Avg", DatasetId.Avg);
		fileToDatasetMap.set("Pass", DatasetId.Pass);
		fileToDatasetMap.set("Fail", DatasetId.Fail);
		fileToDatasetMap.set("Audit", DatasetId.Audit);
		if (!fileToDatasetMap.has(fileKey)) {
			throw new InsightError("File key does not correspond to DatasetId");
		}
		return fileToDatasetMap.get(fileKey)!!;
	}
}

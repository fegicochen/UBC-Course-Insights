import JSZip from "jszip";
import { Section } from "./Dataset";
import { InsightError } from "./IInsightFacade";

export default class DatasetProcessor {
	/**
	 *
	 * @param content zip file
	 * @returns Returns the valid sections from zip file
	 */
	public static async getValidSections(content: string): Promise<Section[]> {
		let validSections: Section[] = [];
		const unzipped = await new JSZip().loadAsync(content, { base64: true });

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
				// Check if the result key exists and if its an array
				if (!Array.isArray(parsedData.result)) {
					throw new InsightError("Invalid section format in file");
				}
				return parsedData.result; // Return the valid sections
			} catch (_error) {
				throw new InsightError("Failed to parse JSON in file");
			}
		});
		// Wait for all promises to resolve and flatten the results
		const courseSectionsArrays = await Promise.all(courseFilePromises);
		validSections = courseSectionsArrays.flat();

		// Check if there's at least one valid section
		if (validSections.length === 0) {
			throw new InsightError("No valid sections found in content!");
		}

		return validSections;
	}

	// public static async checkSectionValidQuerys(sections: Promise<Section[]>): Promise<Section[]> {}
}

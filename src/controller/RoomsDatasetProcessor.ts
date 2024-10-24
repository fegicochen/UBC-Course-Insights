import { parse } from "parse5";
import { DatasetUtils, Room } from "./Dataset";
import { InsightError } from "./IInsightFacade";

const roomsHtmlFileName = "index.htm";

export class RoomsDatasetProcessor {

	public static async getValidRooms(content: string): Promise<Room[]> {
		const unzipped = await DatasetUtils.unzipBase64Content(content);

		// Get file describing the rooms
		const roomsFile = unzipped.file(roomsHtmlFileName);
		if (roomsFile === null) {
			throw new InsightError("No index.htm file!");
		}

		// Get rooms file content
		const roomsFileContent = await roomsFile.async("string");

		// Parse HTML to JSON with parse5
		const roomsFileJSON = parse(roomsFileContent);

		// TODO: finish implementation
		return [];
	}

}

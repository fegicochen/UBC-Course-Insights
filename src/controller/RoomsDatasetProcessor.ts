import { parse } from "parse5";
import {
	Document as ParseDoc,
	ChildNode as ParseChildNode,
	Element,
	TextNode,
} from "parse5/dist/tree-adapters/default";
import { DatasetUtils, Room } from "./Dataset";
import { InsightError } from "./IInsightFacade";
import JSZip from "jszip";
import * as http from "node:http";

const roomsHtmlFileName = "index.htm";

interface RoomsRow {
	title: string;
	address: string;
}

interface GeoResponse {
	lat?: number;
	lon?: number;
	error?: string;
}

export class RoomsDatasetProcessor {
	/**
	 *
	 * @param content base64 zip file content
	 * @returns valid rooms from the given zip file
	 * @throws InsightError if there are any fatal unrecoverable parsing errors
	 */
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
		const roomsFileJSON: ParseDoc = parse(roomsFileContent);

		// Extract address data from table in index.htm
		const roomsTable = this.findRoomsTable(roomsFileJSON);
		const roomsTableData = this.parseRoomsTable(roomsTable as Element);

		// Check valid data
		if (roomsTableData.length === 0) {
			throw new InsightError("No valid rooms!");
		}

		// Parse room files deeper in zip
		const allRooms = await this.parseRoomsFiles(unzipped, roomsTableData);

		return allRooms;
	}

	/**
	 *
	 * @param unzipped the unzipped root folder
	 * @param addresses room addresses from index.htm
	 * @returns valid rooms from files
	 */
	private static async parseRoomsFiles(unzipped: JSZip, addresses: RoomsRow[]): Promise<Room[]> {
		const folder = unzipped.folder("campus/discover/buildings-and-classrooms");
		if (folder === null) {
			throw new InsightError("Rooms folder not found.");
		}
		const rooms: Room[] = [];
		const files = await Promise.all(Object.values(folder.files).map(async (x) => x.async("string")));
		for (const file of files) {
			const fileContentParsed = parse(file);
			const roomData = this.parseSingleRoomFile(fileContentParsed, addresses);
			if (roomData !== undefined) {
				rooms.push(roomData);
			}
		}
		return rooms;
	}

	/**
	 *
	 * @param content parsed file content
	 * @param addresses rooms and their addresses
	 * @returns room from file or undefined if file is invalid
	 */
	private static parseSingleRoomFile(content: ParseDoc, addresses: RoomsRow[]): Room | undefined {
		try {
			const roomsTable = this.findRoomsTable(content) as Element;
			for (const row of roomsTable.childNodes) {
				const rowCast = row as Element;
				// TODO
			}
		} catch (e) {
			if (e instanceof InsightError) {
				return undefined;
			}
			throw e;
		}
	}

	/**
	 *
	 * @param roomsTable the rooms table in index.htm
	 * @returns valid rooms rows with info
	 */
	private static parseRoomsTable(roomsTable: Element): RoomsRow[] {
		return (
			roomsTable.childNodes
				// Ensure child nodes present and cast
				.map((trChildUncast) => {
					const trChildCast = trChildUncast as Element;
					if (trChildCast.childNodes === undefined) {
						return undefined;
					}
					return trChildCast;
				})
				// Remove ones without child nodes
				.filter((child) => child !== undefined)
				// Remove ones that aren't <tr>
				.filter((child) => child?.nodeName === "tr")
				// Map to undefined if internal format wrong, otherwise map to RoomsRow
				.map((trChild) => this.parseSingleTr(trChild!!))
				// Remove invalid <tr>'s
				.filter((x) => x !== undefined)
				.map((x) => x!!)
		);
	}

	/**
	 *
	 * @param tr the <tr> entry in the rooms index.htm table
	 * @returns a RoomsRow if it is valid, undefined otherwise
	 */
	private static parseSingleTr(tr: Element): RoomsRow | undefined {
		let roomTitle: string | undefined;
		let roomAddress: string | undefined;
		for (const tdChildUncast of tr.childNodes) {
			const tdChildCast = tdChildUncast as Element;
			if (tdChildCast.nodeName === "td" && tdChildCast.attrs !== undefined) {
				// Check attrs for different pieces of data
				const classAttr = tdChildCast.attrs.find((x) => x.name === "class");
				if (classAttr === undefined || !classAttr.value.includes("views-field")) {
					continue;
				} else if (classAttr.value.includes("views-field-title")) {
					const refChild = tdChildCast.childNodes.find((x) => x.nodeName === "a") as Element;
					const refText = refChild.childNodes.find((x) => x.nodeName === "#text") as TextNode;
					roomTitle = refText.value.trim();
				} else if (classAttr.value.includes("views-field-field-building-address")) {
					const textChild = tdChildCast.childNodes.find((x) => x.nodeName === "#text") as TextNode;
					roomAddress = textChild.value.trim();
				}
			}
		}
		if (roomAddress !== undefined && roomTitle !== undefined) {
			return {
				title: roomTitle,
				address: roomAddress,
			};
		}
		return undefined;
	}

	/**
	 *
	 * @param document document to search for rooms table
	 * @returns rooms table element
	 * @throws InsightError if table not found
	 */
	private static findRoomsTable(document: ParseDoc): ParseChildNode {
		for (const child of document.childNodes) {
			const res = this.findTableInChild(child, false);
			if (res !== undefined) {
				return res;
			}
		}
		throw new InsightError("Could not find rooms table in index.htm");
	}

	/**
	 *
	 * @param child child to search
	 * @param seenTable whether this child is a child of a table
	 * @returns child node of table if found, else undefined
	 */
	private static findTableInChild(child: ParseChildNode, seenTable: boolean): ParseChildNode | undefined {
		// Check if table is found
		if (seenTable && child.nodeName === "tbody" && Array.isArray(child.childNodes) && child.childNodes.length > 0) {
			for (const trChild of child.childNodes) {
				if (
					trChild.nodeName === "tr" &&
					trChild.childNodes.find(
						(tdChild) =>
							tdChild.nodeName === "td" &&
							tdChild.attrs.find(
								(attr) =>
									attr.name === "class" &&
									attr.value.includes("views-field") &&
									attr.value.includes("views-field-field-building-address")
							)
					)
				) {
					return child;
				}
			}
		}
		// Check children for table
		const children = (child as any).childNodes;
		if (Array.isArray(children)) {
			for (const x of children) {
				const res = this.findTableInChild(x, seenTable || x.nodeName === "table");
				if (res !== undefined) {
					return res;
				}
			}
		}
		return undefined;
	}

	/**
	 *
	 * @param address the unzipped root folder
	 * @param address room addresses from index.htm
	 * @returns GeoResponse object that has lat and lon or error
	 */
	public static async getGeoLocation(
		address: string
	): Promise<{ lat: number | undefined; lon: number | undefined; error: string | undefined }> {
		const encodedAddress = encodeURIComponent(address);
		const url = `http://cs310.students.cs.ubc.ca:11316/api/v1/project_team085/${encodedAddress}`;

		const response = await (async (): Promise<any> =>
			new Promise((resolve, reject) => {
				const req = http.get(url);
				req.on("response", (res) => resolve(res));

				req.on("error", (err) => reject(err));

				req.end();
			}))();

		let body = "";
		for await (const chunk of response) {
			body += chunk;
		}
		return JSON.parse(body);
	}
}

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
import { Attribute } from "parse5/dist/common/token";

const roomsHtmlFileName = "index.htm";

interface BuildingInfo {
	title: string;
	code: string;
	address: string;
	lat: number;
	lon: number;
}

type BuildingInfoMap = Map<string, Promise<BuildingInfo | undefined>>;

interface RoomsRow {
	title: string;
	code: string;
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
		const roomsTableData = this.parseRoomsTable(roomsTable);

		// Check valid data
		if (roomsTableData.length === 0) {
			throw new InsightError("No valid rooms!");
		}

		// Get building info
		const buildingInfoMap = this.createAllBuildingInfo(roomsTableData);

		// Parse room files deeper in zip
		const allRooms = await this.parseRoomsFiles(unzipped, buildingInfoMap);

		return allRooms;
	}

	/**
	 *
	 * @param unzipped the unzipped root folder
	 * @param addresses room addresses from index.htm
	 * @returns valid rooms from files
	 */
	private static async parseRoomsFiles(unzipped: JSZip, buildingInfoMap: BuildingInfoMap): Promise<Room[]> {
		const files = await Promise.all(
			Object.values(unzipped.files)
				.filter((x) => x.name.startsWith("campus/discover/buildings-and-classrooms"))
				.map(async (x) => ({ name: x.name, data: await x.async("string") }))
		);
		const parsedRoomLists = await Promise.all(
			files.map(async (file): Promise<Room[]> => {
				const fileContentParsed = parse(file.data);
				const fileRoomCode = file.name
					.replaceAll(".htm", "")
					.split("/")
					.find((_, idx, arr) => idx === arr.length - 1)!!;
				if (!buildingInfoMap.has(fileRoomCode)) {
					// console.log("Building info doesn't have: " + fileRoomCode);
					return [];
				}
				const buildingInfo = await buildingInfoMap.get(fileRoomCode)!!;
				if (buildingInfo === undefined) {
					// console.log("Building info request failed: " + fileRoomCode);
					return [];
				}
				return this.parseSingleRoomFile(fileContentParsed, buildingInfo);
			})
		);
		return parsedRoomLists.flat();
	}

	/**
	 *
	 * @param addresses addresses, titles, and room codes from index.htm
	 * @returns the building info map
	 */
	private static createAllBuildingInfo(addresses: RoomsRow[]): BuildingInfoMap {
		const map = new Map<string, Promise<BuildingInfo | undefined>>();

		for (const address of addresses) {
			// request data
			const addressRequestFn = async (): Promise<BuildingInfo | undefined> => {
				const { lat, lon, error } = await this.getGeoLocation(address.address);
				if (error !== undefined || lat === undefined || lon === undefined) {
					return undefined;
				}
				return {
					title: address.title,
					code: address.code,
					address: address.address,
					lat: lat,
					lon: lon,
				};
			};
			map.set(address.code, addressRequestFn());
		}

		return map;
	}

	/**
	 *
	 * @param content parsed file content
	 * @param addresses rooms and their addresses
	 * @returns room from file or undefined if file is invalid
	 */
	private static parseSingleRoomFile(content: ParseDoc, buildingInfo: BuildingInfo): Room[] {
		let roomsTable: Element;
		try {
			roomsTable = this.findRoomsTable(content);
		} catch (_e) {
			// console.log("Could not find rooms table in: " + roomCode);
			return [];
		}
		const rooms: Room[] = [];
		this.forAllNodesOfType(roomsTable, "tr", (tr) => {
			try {
				const room = this.parseSingleRoomInRoomFile(tr as Element, buildingInfo);
				if (room !== undefined) {
					rooms.push(room);
				}
			} catch (_e) {
				// Moving on ...
				console.log(_e);
			}
		});
		return rooms;
	}

	/**
	 *
	 * @param tr the tr element inside the table body contianing the tds to look for attributes on
	 * @param buildingInfo the building info for the current building
	 * @returns a room from this tr and the given building info
	 */
	private static parseSingleRoomInRoomFile(tr: Element, buildingInfo: BuildingInfo): Room | undefined {
		// Child is a tr containing the tds with data
		let seats: number | undefined;
		let furniture: string | undefined;
		let type: string | undefined;
		let roomNumber: string | undefined;
		let href: string | undefined;
		for (const child of tr.childNodes) {
			if (this.tableClassIsValid(child)) {
				// Check attrs for different pieces of data
				if (this.classContains(child, "views-field-field-room-capacity")) {
					seats = parseInt(this.getInternalText(child) ?? "?", 10);
				} else if (this.classContains(child, "views-field-field-room-furniture")) {
					furniture = this.getInternalText(child);
				} else if (this.classContains(child, "views-field-field-room-type")) {
					type = this.getInternalText(child);
				} else if (this.classContains(child, "views-field-field-room-number")) {
					roomNumber = this.getInternalText(this.getNamedChild(child, "a") as Element);
				} else if (this.classContains(child, "views-field-nothing")) {
					href = this.getAttribute(this.getNamedChild(child, "a"), "href")?.value;
				}
			}
		}
		return {
			seats: seats!!,
			furniture: furniture?.trim()!!,
			type: type?.trim()!!,
			number: roomNumber?.trim()!!,
			address: buildingInfo.address,
			lat: buildingInfo.lat,
			lon: buildingInfo.lon,
			fullname: buildingInfo.title,
			shortname: buildingInfo.code,
			href: href?.trim()!!,
			name: buildingInfo.code + "_" + roomNumber?.trim()!!,
		};

	}
	/**
	 *
	 * @param parent parent node to search
	 * @param type type of child to match
	 * @param fn function to apply
	 */
	private static forAllNodesOfType(
		parent: ParseChildNode | undefined,
		type: string,
		fn: (child: ParseChildNode) => void
	): void {
		(parent as Element | undefined)?.childNodes?.forEach((childNode) => {
			if (childNode.nodeName === type) {
				fn(childNode);
			}
		});
	}

	/**
	 *
	 * @param x the element to search
	 * @param attrName the attribute to find
	 * @returns the named attribute or undefined if not present
	 */
	private static getAttribute(x: ParseChildNode | undefined, attrName: string): Attribute | undefined {
		return (x as Element | undefined)?.attrs?.find((y) => y.name === attrName);
	}

	/**
	 *
	 * @param x the node whos children to check
	 * @param name the name of the node to search for
	 * @returns the child with the given name or undefined if not found
	 */
	private static getNamedChild(x: Element, name: string): ParseChildNode | undefined {
		return x.childNodes.find((y) => y.nodeName === name);
	}

	/**
	 *
	 * @param x the element to retrieve internal text of
	 * @returns string if element has a #text child, undefined otherwise
	 */
	private static getInternalText(x: Element | undefined): string | undefined {
		const textNode = x?.childNodes.find((p) => p.nodeName === "#text") as TextNode | undefined;
		return textNode?.value;
	}

	/**
	 *
	 * @param x the child node to check
	 * @returns the class attribute of the child node if it exists, false otherwise
	 */
	private static getClass(x: ParseChildNode): Attribute | undefined {
		return this.getAttribute(x, "class");
	}

	/**
	 *
	 * @param x the attribute to check
	 * @returns whether this is a valid class signature of a table item
	 */
	private static tableClassIsValid(x: ParseChildNode | undefined): x is Element {
		if (x === undefined || x.nodeName !== "td") {
			return false;
		}
		const xClass = this.getClass(x);
		return xClass?.value.includes("views-field") === true;
	}

	/**
	 *
	 * @param x the child node to check
	 * @param values the values to check if in class
	 * @returns whether all values are in the class of the given item
	 */
	private static classContains(x: ParseChildNode, ...values: string[]): boolean {
		const xClass = this.getClass(x);
		if (xClass === undefined) {
			return false;
		}
		return values.map((value) => xClass.value.includes(value)).reduce((prev, curr) => prev && curr, true);
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
		let roomCode: string | undefined;
		for (const child of tr.childNodes) {
			if (this.tableClassIsValid(child)) {
				// Check attrs for different pieces of data
				if (this.classContains(child, "views-field-title")) {
					roomTitle = this.getInternalText(this.getNamedChild(child, "a") as Element)?.trim();
				} else if (this.classContains(child, "views-field-field-building-address")) {
					roomAddress = this.getInternalText(child)?.trim();
				} else if (this.classContains(child, "views-field-field-building-code")) {
					roomCode = this.getInternalText(child)?.trim();
				}
			}
		}
		if ([roomTitle, roomAddress, roomCode].filter((x) => x === undefined).length === 0) {
			return {
				title: roomTitle!!,
				address: roomAddress!!,
				code: roomCode!!,
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
	private static findRoomsTable(document: ParseDoc): Element {
		for (const child of document.childNodes) {
			const res = this.findTableInChild(child, false);
			if (res !== undefined) {
				return res as Element;
			}
		}
		throw new InsightError("Could not find rooms table");
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
							tdChild.attrs.find((attr) => attr.name === "class" && attr.value.includes("views-field"))
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
	public static async getGeoLocation(address: string): Promise<GeoResponse> {
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

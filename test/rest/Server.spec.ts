import { expect } from "chai";
import request, { Response } from "supertest";
import { StatusCodes } from "http-status-codes";
import Log from "@ubccpsc310/folder-test/build/Log";
import Server from "../../src/rest/Server";
import fs from "fs-extra";
import { clearDisk } from "../TestUtil";

describe("Facade C3", function () {
	let server: Server;
	let sections: Buffer;
	let validQuery: object;
	let invalidQuery: string;
	before(async function () {
		// TODO: start server here once and handle errors properly
		try {
			sections = await fs.promises.readFile("test/resources/archives/pair.zip");
		} catch (err) {
			Log.error(err);
			expect.fail("Failed to read the file");
		}
		validQuery = {
			WHERE: {
				GT: {
					sections_avg: 97,
				},
			},
			OPTIONS: {
				COLUMNS: ["sections_dept", "sections_avg"],
				ORDER: "sections_avg",
			},
		};
		invalidQuery = "Invalid Query";

		const port = 4321;

		server = new Server(port);
		await server.start();
	});

	after(async function () {
		// TODO: stop server here once!
		await server.stop();
	});

	beforeEach(function () {
		// might want to add some process logging here to keep track of what is going on
	});

	afterEach(async function () {
		// might want to add some process logging here to keep track of what is going on
		await clearDisk();
	});

	// Sample on how to format PUT requests
	it("PUT test for courses dataset", async function () {
		const SERVER_URL = "http://localhost:4321";
		const ENDPOINT_URL = "/dataset/sections/sections";

		try {
			return request(SERVER_URL)
				.put(ENDPOINT_URL)
				.send(sections)
				.set("Content-Type", "application/x-zip-compressed")
				.then(function (res: Response) {
					expect(res.status).to.be.equal(StatusCodes.OK);
				})
				.catch(function () {
					expect.fail();
				});
		} catch (err) {
			Log.error(err);
			expect.fail("Should not have failed");
		}
	});

	it("PUT test for invalid dataset", async function () {
		const SERVER_URL = "http://localhost:4321";
		const ENDPOINT_URL = "/dataset/sections/sections";

		try {
			return request(SERVER_URL)
				.put(ENDPOINT_URL)
				.send("invalid")
				.set("Content-Type", "application/x-zip-compressed")
				.then(function (res: Response) {
					expect(res.status).to.be.equal(StatusCodes.BAD_REQUEST);
				})
				.catch(function () {
					expect.fail();
				});
		} catch (err) {
			Log.error(err);
			expect.fail("Should not have failed");
		}
	});

	// The other endpoints work similarly. You should be able to find all instructions in the supertest documentation

	it("DELETE test for courses dataset", function () {
		const SERVER_URL = "http://localhost:4321";
		const ENDPOINT_URL = "/dataset/sections/sections";

		try {
			request(SERVER_URL)
				.put(ENDPOINT_URL)
				.send(sections)
				.set("Content-Type", "application/x-zip-compressed")
				.then(async function (res: Response) {
					expect(res.status).to.be.equal(StatusCodes.OK);

					return request(SERVER_URL)
						.delete(ENDPOINT_URL)
						.then(function (res2: Response) {
							expect(res2.status).to.be.equal(StatusCodes.OK);
						})
						.catch(function () {
							expect.fail();
						});
				})
				.catch(function () {
					expect.fail();
				});
		} catch (err) {
			Log.error(err);
			expect.fail("Should not have failed");
		}
	});

	it("DELETE test for non existent dataset", async function () {
		const SERVER_URL = "http://localhost:4321";
		const ENDPOINT_URL = "/dataset/sections/none";

		try {
			return request(SERVER_URL)
				.delete(ENDPOINT_URL)
				.then(function (res: Response) {
					expect(res.status).to.be.equal(StatusCodes.NOT_FOUND);
				})
				.catch(function () {
					expect.fail();
				});
		} catch (err) {
			Log.error(err);
			expect.fail("Should not have failed");
		}
	});

	it("GET test for datasets", function () {
		const SERVER_URL = "http://localhost:4321";
		const ENDPOINT_URL = "/dataset/sections/sections";

		try {
			request(SERVER_URL)
				.put(ENDPOINT_URL)
				.send(sections)
				.set("Content-Type", "application/x-zip-compressed")
				.then(async function (res: Response) {
					expect(res.status).to.be.equal(StatusCodes.OK);

					return request(SERVER_URL)
						.get("/datasets")
						.then(function (res2: Response) {
							expect(res2.status).to.be.equal(StatusCodes.OK);
						})
						.catch(function () {
							expect.fail();
						});
				})
				.catch(function () {
					expect.fail();
				});
		} catch (err) {
			Log.error(err);
			expect.fail("Should not have failed");
		}
	});

	it("POST test for valid query", function () {
		const SERVER_URL = "http://localhost:4321";
		const ENDPOINT_URL = "/dataset/sections/sections";

		try {
			request(SERVER_URL)
				.put(ENDPOINT_URL)
				.send(sections)
				.set("Content-Type", "application/x-zip-compressed")
				.then(async function (res: Response) {
					expect(res.status).to.be.equal(StatusCodes.OK);

					return request(SERVER_URL)
						.post("/query")
						.send(validQuery)
						.set("Content-Type", "application/json")
						.then(function (res2: Response) {
							expect(res2.status).to.be.equal(StatusCodes.OK);
						})
						.catch(function () {
							expect.fail();
						});
				})
				.catch(function () {
					expect.fail();
				});
		} catch (err) {
			Log.error(err);
			expect.fail("Should not have failed");
		}
	});

	it("POST test for invalid query", function () {
		const SERVER_URL = "http://localhost:4321";
		const ENDPOINT_URL = "/dataset/sections/sections";

		try {
			request(SERVER_URL)
				.put(ENDPOINT_URL)
				.send(sections)
				.set("Content-Type", "application/x-zip-compressed")
				.then(async function (res: Response) {
					expect(res.status).to.be.equal(StatusCodes.OK);

					return request(SERVER_URL)
						.post("/query")
						.send(invalidQuery)
						.set("Content-Type", "application/json")
						.then(function (res2: Response) {
							expect(res2.status).to.be.equal(StatusCodes.BAD_REQUEST);
						})
						.catch(function () {
							expect.fail();
						});
				})
				.catch(function () {
					expect.fail();
				});
		} catch (err) {
			Log.error(err);
			expect.fail("Should not have failed");
		}
	});
});

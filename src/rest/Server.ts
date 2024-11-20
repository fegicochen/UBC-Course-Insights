import express, { Application, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import Log from "@ubccpsc310/folder-test/build/Log";
import * as http from "http";
import cors from "cors";
import InsightFacade from "../controller/InsightFacade";
import {
	InsightDataset,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
} from "../controller/IInsightFacade";

export default class Server {
	private readonly port: number;
	private express: Application;
	private server: http.Server | undefined;

	constructor(port: number) {
		Log.info(`Server::<init>( ${port} )`);
		this.port = port;
		this.express = express();

		this.registerMiddleware();
		this.registerRoutes();

		// NOTE: you can serve static frontend files in from your express server
		// by uncommenting the line below. This makes files in ./frontend/public
		// accessible at http://localhost:<port>/
		// this.express.use(express.static("./frontend/public"))
	}

	/**
	 * Starts the server. Returns a promise that resolves if success. Promises are used
	 * here because starting the server takes some time and we want to know when it
	 * is done (and if it worked).
	 *
	 * @returns {Promise<void>}
	 */
	public async start(): Promise<void> {
		return new Promise((resolve, reject) => {
			Log.info("Server::start() - start");
			if (this.server !== undefined) {
				Log.error("Server::start() - server already listening");
				reject();
			} else {
				this.server = this.express
					.listen(this.port, () => {
						Log.info(`Server::start() - server listening on port: ${this.port}`);
						resolve();
					})
					.on("error", (err: Error) => {
						// catches errors in server start
						Log.error(`Server::start() - server ERROR: ${err.message}`);
						reject(err);
					});
			}
		});
	}

	/**
	 * Stops the server. Again returns a promise so we know when the connections have
	 * actually been fully closed and the port has been released.
	 *
	 * @returns {Promise<void>}
	 */
	public async stop(): Promise<void> {
		Log.info("Server::stop()");
		return new Promise((resolve, reject) => {
			if (this.server === undefined) {
				Log.error("Server::stop() - ERROR: server not started");
				reject();
			} else {
				this.server.close(() => {
					Log.info("Server::stop() - server closed");
					resolve();
				});
			}
		});
	}

	// Registers middleware to parse request before passing them to request handlers
	private registerMiddleware(): void {
		// JSON parser must be place before raw parser because of wildcard matching done by raw parser below
		this.express.use(express.json());
		this.express.use(express.raw({ type: "application/*", limit: "10mb" }));

		// enable cors in request headers to allow cross-origin HTTP requests
		this.express.use(cors());
	}

	// Registers all request handlers to routes
	private registerRoutes(): void {
		// This is an example endpoint this you can invoke by accessing this URL in your browser:
		// http://localhost:4321/echo/hello
		this.express.get("/echo/:msg", Server.echo);

		this.express.put("/dataset/:id/:kind", Server.putDataset);
		this.express.delete("/dataset/:id", Server.deleteDataset);

		this.express.get("/datasets", Server.getDatasets);

		this.express.post("/query", Server.postQuery);

		// TODO: your other endpoints should go here
	}

	private static async getDatasets(_req: Request, res: Response): Promise<void> {
		try {
			Log.info(`Getting datasets`);
			const response = await Server.performGetDatasets();
			res.status(StatusCodes.OK).json({ result: response });
		} catch (err) {
			res.status(StatusCodes.OK).json({ error: (err as any)?.message ?? err });
		}
	}

	private static async performGetDatasets(): Promise<InsightDataset[]> {
		return await new InsightFacade().listDatasets();
	}

	private static async putDataset(req: Request, res: Response): Promise<void> {
		try {
			Log.info(`Putting dataset: ${req.params.id} with kind ${req.params.kind}`);
			const content: string = req.body.toString("base64");
			const response = await Server.performPutDataset(req.params.id, req.params.kind, content);
			res.status(StatusCodes.OK).json({ result: response });
		} catch (err) {
			Log.error("Bad dataset PUT request: " + (err as any)?.message);
			res.status(StatusCodes.BAD_REQUEST).json({ error: (err as any)?.message ?? err });
		}
	}

	private static async performPutDataset(id: string, kind: string, content: string): Promise<string[]> {
		const facade = new InsightFacade();
		if (kind !== InsightDatasetKind.Rooms && kind !== InsightDatasetKind.Sections) {
			throw new InsightError("Bad dataset kind.");
		}
		return await facade.addDataset(id, content, kind as InsightDatasetKind);
	}

	private static async deleteDataset(req: Request, res: Response): Promise<void> {
		try {
			Log.info(`Delete dataset: ${req.params.id}`);
			const response = await Server.performDeleteDataset(req.params.id);
			res.status(StatusCodes.OK).json({ result: response });
		} catch (err) {
			if (err instanceof NotFoundError) {
				res.status(StatusCodes.NOT_FOUND).json({ error: (err as any)?.message ?? err });
			} else {
				res.status(StatusCodes.BAD_REQUEST).json({ error: (err as any)?.message ?? err });
			}
		}
	}
	private static async performDeleteDataset(id: string): Promise<string> {
		const facade = new InsightFacade();
		return await facade.removeDataset(id);
	}
	private static async postQuery(req: Request, res: Response): Promise<void> {
		try {
			Log.info(`Performing query: ${req.body}`);
			const response = await Server.performPostQuery(req.body);
			res.status(StatusCodes.OK).json({ result: response });
		} catch (err) {
			res.status(StatusCodes.BAD_REQUEST).json({ error: (err as any)?.message ?? err });
		}
	}

	private static async performPostQuery(query: unknown): Promise<InsightResult[]> {
		return await new InsightFacade().performQuery(query);
	}

	// The next two methods handle the echo service.
	// These are almost certainly not the best place to put these, but are here for your reference.
	// By updating the Server.echo function pointer above, these methods can be easily moved.
	private static echo(req: Request, res: Response): void {
		try {
			Log.info(`Server::echo(..) - params: ${JSON.stringify(req.params)}`);
			const response = Server.performEcho(req.params.msg);
			res.status(StatusCodes.OK).json({ result: response });
		} catch (err) {
			res.status(StatusCodes.BAD_REQUEST).json({ error: err });
		}
	}

	private static performEcho(msg: string): string {
		if (typeof msg !== "undefined" && msg !== null) {
			return `${msg}...${msg}`;
		} else {
			return "Message not provided";
		}
	}
}

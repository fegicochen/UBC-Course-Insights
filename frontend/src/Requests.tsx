

export type InsightResult = Record<string, string | number>;

export interface InsightDataset {
	id: string;
	kind: string;
	numRows: number;
}

export const requestDatasets = async (): Promise<InsightDataset[]> => {
	const headers = new Headers();
	const request: RequestInfo = new Request('http://localhost:4321/datasets', {
		method: 'GET',
		headers: headers
	});

	return await fetch(request)
		.then(res => res.json())
		.then(res => {
			if (res.error !== undefined) {
				throw new Error(res.error);
			}
			return res.result as InsightDataset[];
		});
};

export const requestRemoveDataset = async (id: string): Promise<string> => {
	const headers = new Headers();
	const request: RequestInfo = new Request('http://localhost:4321/dataset/' + id, {
		method: 'DELETE',
		headers: headers
	});

	return await fetch(request)
		.then(res => res.json())
		.then(res => {
			if (res.error !== undefined) {
				throw new Error(res.error);
			} else if (res.result !== id) {
				throw new Error("Removed id did not match expected!");
			}
			return res.result as string;
		});
};


export const requestAddDataset = async (id: string, kind: string, file: File): Promise<string[]> => {
	const data = new FormData();
	data.append("file", file);

	const headers = new Headers();
	headers.append("Content-Type", "application/zip");

	return await fetch('http://localhost:4321/dataset/' + id + "/" + kind, {
		method: 'PUT',
		headers: headers,
		body: await file.arrayBuffer()
	})
		.then(res => res.json())
		.then(res => {
			if (res.error !== undefined) {
				throw new Error(res.error);
			}
			return res.result as string[];
		});
};

export const requestQuery = async (query: unknown): Promise<InsightResult[]> => {
	const headers = new Headers();
	headers.append("Content-Type", "application/json");

	console.log("Querying: " + JSON.stringify(query));

	return await fetch('http://localhost:4321/query', {
		method: 'POST',
		headers: headers,
		body: JSON.stringify(query as any)
	})
	.then(res => res.json())
	.then(res => {
		if (res.error !== undefined) {
			throw new Error(res.error);
		}
		return res.result as InsightResult[];
	});
}

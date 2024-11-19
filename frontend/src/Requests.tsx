

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
			if (res.message !== undefined) {
				throw new Error(res.message);
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
			if (res.message !== undefined) {
				throw new Error(res.message);
			} else if (res.result !== id) {
				throw new Error("Removed id did not match expected!");
			}
			return res.result as string;
		});
};

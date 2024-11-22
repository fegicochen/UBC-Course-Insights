import React, { useEffect, useMemo, useState } from 'react';
import logo from './logo.svg';
import './App.css';
import { Button, CircularProgress, Container, Divider, FormControl, Grid2 as Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { InsightDataset, requestAddDataset, requestDatasets, requestQuery, requestRemoveDataset } from './Requests';
import { Bar } from 'react-chartjs-2';

function App() {

	const [datasets, setDatasets] = useState<InsightDataset[]>([]);
	const [selectedDataset, setSelectedDataset] = useState<InsightDataset | undefined>();

	return (
	<Container sx={{width: "100%"}}>
		<Grid container spacing={2} alignItems={'center'} justifyItems={'center'} textAlign={'center'}>
			<Grid size={12}>
				<h1>Insight Facade</h1>
			</Grid>
			<Grid size={6}>
				<DatasetsManager datasets={datasets} setDatasets={setDatasets} setSelectedDataset={setSelectedDataset} />
			</Grid>
			<Grid size={6}>
				{selectedDataset === undefined
				? <Typography>Select a dataset to view insights</Typography>
				: <Graphs dataset={selectedDataset} />}
			</Grid>
		</Grid>
	</Container>
	);
}

const DatasetsManager = (props: {
	datasets: InsightDataset[],
	setDatasets: (d: InsightDataset[]) => void,
	setSelectedDataset: (d: InsightDataset | undefined) => void
}) => {
	const [errorText, setErrorText] = useState("");
	const [callingAPI, setCallingAPI] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [kind, setKind] = useState<string>("");
	const [datasetId, setDatasetId] = useState("");

	const updateDatasets = async (): Promise<void> => {
		setCallingAPI(true);
		props.setSelectedDataset(undefined);
		return requestDatasets()
			.then(res => {
				console.log(JSON.stringify(res));
				props.setDatasets(res as InsightDataset[]);
			})
			.catch(e => {
				console.error("GET DATASETS ERROR: " + e.message);
				setErrorText(e.message);
			})
			.finally(() => {
				setCallingAPI(false);
			});
	};

	const addDataset = async(): Promise<void> => {
		setCallingAPI(true);
		return requestAddDataset(datasetId, kind, file!)
			.then(res => {
				console.log(JSON.stringify(res));
				setErrorText("");
			})
			.catch(e => {
				console.error("ADD DATASETS ERROR: " + e.message);
				setErrorText(e.message);
			})
			.finally(() => {
				updateDatasets();
			});
	}

	const removeDataset = (id: string) => {
		setCallingAPI(true);
		requestRemoveDataset(id)
			.then(res => {
				console.log(JSON.stringify(res));
				setErrorText("");
			})
			.catch(e => {
				console.error("REMOVE DATASETS ERROR: " + e.message);
				setErrorText(e.message);
			})
			.finally(() => {
				updateDatasets();
			});
	};

	useEffect(() => {
		updateDatasets();
	}, []);
	return (<>
		<Stack spacing={2}>
			<TextField
				label="Dataset Id"
				value={datasetId}
				helperText="Cannot contain underscores"
				onChange={(event) => {setDatasetId(event.target.value.trim())}} />
			<FormControl fullWidth>
				<InputLabel id="kind">Dataset Kind</InputLabel>
				<Select
					value={kind}
					label="Dataset Kind"
					labelId='kind'
					onChange={(event) => setKind(event.target.value)}>
						<MenuItem value={""}>None</MenuItem>
						<MenuItem value={"sections"}>Sections</MenuItem>
						<MenuItem value={"rooms"}>Rooms</MenuItem>
				</Select>
			</FormControl>
			<input type="file" onChange={(event) => {setFile((event.target.files ?? [null])[0] ?? null)}}/>
			<Button variant='contained'
				disabled={callingAPI || file === null || datasetId === "" || kind === ""}
				onClick={addDataset}>
				{"Add Dataset" + (datasetId === "" ? " (add an id)" :
					kind === "" ? " (add kind)" :
					file === null ? " (select a file)" : "")}
			</Button>
			<Button variant='contained' onClick={updateDatasets} disabled={callingAPI}>Refresh Dataset List</Button>
			<Typography variant='caption'>{errorText}</Typography>
			<Paper>
				<h3>Datasets</h3>
				<Divider/>
				<Stack direction={'column'}>
					{props.datasets.map(dataset => (<>
					<Stack direction={'row'} alignItems={'center'}>
						<Typography>{dataset.id + " has " + dataset.numRows + " rows of " + dataset.kind}</Typography>
						<Button onClick={() => props.setSelectedDataset(dataset)}>View Insights</Button>
						<Button onClick={() => removeDataset(dataset.id)}>Delete</Button>
					</Stack>
					</>))}
				</Stack>
			</Paper>
		</Stack>
	</>);
};

const Graphs = (props: {
	dataset: InsightDataset
}) => {

	const [querying, setQuerying] = useState(false);

	return (<>
		<Stack>
			<h2>Insights for "{props.dataset.id}":</h2>
			{props.dataset.kind === 'sections'
			? <SectionGraphs dataset={props.dataset} querying={querying} setQuerying={setQuerying}/>
			: <RoomsGraphs dataset={props.dataset} querying={querying} setQuerying={setQuerying}/>}
		</Stack>
	</>);
}

const RoomsGraphs = (props: {
	dataset: InsightDataset,
	querying: boolean,
	setQuerying: (q: boolean) => void
}) => {
	const id = props.dataset.id;

	useEffect(() => {
		requestQuery({
		})
		.then((res) => {

		})
		.catch(e => {
			console.error((e as any)?.message ?? e);
		});
	}, [props.dataset]);

	return (<>
	<Typography>Rooms insights:</Typography>
	{props.querying && <CircularProgress />}
	</>);
}

const SectionGraphs = (props: {
	dataset: InsightDataset,
	querying: boolean,
	setQuerying: (q: boolean) => void
}) => {
	const id = props.dataset.id;

	useEffect(() => {
		requestQuery({
			"WHERE": {},
			"OPTIONS": {
				"COLUMNS": [id + "_title", "overallAvg"]
			},
			"TRANSFORMATIONS": {
				"GROUP": [id + "_title"],
				"APPLY": [{
					"overallAvg": {
						"AVG": id + "_avg"
					}
				}]
			}
		})
		.then((res) => {
			console.log(JSON.stringify(res))
		})
		.catch(e => {
			console.error((e as any)?.message ?? e);
		});
	}, [props.dataset, id]);

	return (<>
	<Typography>Sections insights:</Typography>
	{props.querying && <CircularProgress />}
	</>);
};

export default App;

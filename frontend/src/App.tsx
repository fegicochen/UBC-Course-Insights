import React, { useEffect, useMemo, useState } from 'react';
import logo from './logo.svg';
import './App.css';
import { Button, Container, Divider, FormControl, Grid2 as Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { InsightDataset, requestAddDataset, requestDatasets, requestRemoveDataset } from './Requests';

function App() {

	const [file, setFile] = useState<File | null>(null);
	const [kind, setKind] = useState<string>("");
	const [datasetId, setDatasetId] = useState("");
	const [datasets, setDatasets] = useState<InsightDataset[]>([]);
	const [callingAPI, setCallingAPI] = useState(false);
	const [errorText, setErrorText] = useState("");

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

	const updateDatasets = async (): Promise<void> => {
		setCallingAPI(true);
		return requestDatasets()
			.then(res => {
				console.log(JSON.stringify(res));
				setDatasets(res as InsightDataset[]);
			})
			.catch(e => {
				console.error("GET DATASETS ERROR: " + e.message);
				setErrorText(e.message);
			})
			.finally(() => {
				setCallingAPI(false);
			});
	};

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

	return (
	<Container sx={{width: "100%"}}>
		<Grid container spacing={2} alignItems={'center'} justifyItems={'center'} textAlign={'center'}>
			<Grid size={12}>
				<h1>Insight Facade</h1>
			</Grid>
			<Grid size={6}>
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
							{datasets.map(dataset => (<>
							<Stack direction={'row'} alignItems={'center'}>
								<Typography>{dataset.id + " has " + dataset.numRows + " rows of " + dataset.kind}</Typography>
								<Button onClick={() => removeDataset(dataset.id)}>Delete</Button>
							</Stack>
							</>))}
						</Stack>
					</Paper>

				</Stack>
			</Grid>
			<Grid size={6}>
				<Stack>
				</Stack>
			</Grid>
			<Grid size={6}>
			</Grid>
		</Grid>
	</Container>
	);
}

export default App;

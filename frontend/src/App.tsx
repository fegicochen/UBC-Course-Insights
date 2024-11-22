import React, { useEffect, useMemo, useState } from 'react';
import logo from './logo.svg';
import './App.css';
import { Button, CircularProgress, Container, Divider, FormControl, Grid2 as Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { InsightDataset, requestAddDataset, requestDatasets, requestQuery, requestRemoveDataset } from './Requests';
import { CategoryScale, Chart as ChartJS } from 'chart.js/auto'
import { Chart, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale);

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
				<DatasetsManager datasets={datasets}
				setDatasets={setDatasets}
				selectedDataset={selectedDataset}
				setSelectedDataset={setSelectedDataset} />
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
	selectedDataset: InsightDataset | undefined,

	setSelectedDataset: (d: InsightDataset | undefined) => void
}) => {
	const [errorText, setErrorText] = useState("");
	const [callingAPI, setCallingAPI] = useState(false);
	const [file, setFile] = useState<File | null>(null);
	const [datasetId, setDatasetId] = useState("");

	const updateDatasets = async (): Promise<void> => {
		setCallingAPI(true);
		return requestDatasets()
			.then(res => {
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
		return requestAddDataset(datasetId, "sections", file!)
			.then(res => {
				setErrorText("Dataset \"" + datasetId + "\" added successfully.");
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
		if (props.selectedDataset?.id === id) {
			props.setSelectedDataset(undefined);
		}
		requestRemoveDataset(id)
			.then(res => {
				setErrorText("Removed dataset \"" + id + "\".");
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

		const refreshInterval = setInterval(() => updateDatasets(), 5000);

		// Unmount
		return () => {
			clearInterval(refreshInterval);
		};
	}, []);



	return (<>
		<Stack spacing={2}>
			<TextField
				label="Dataset Id"
				value={datasetId}
				helperText="Cannot contain underscores"
				onChange={(event) => {setDatasetId(event.target.value.trim())}} />
			<input type="file" onChange={(event) => {setFile((event.target.files ?? [null])[0] ?? null)}}/>
			<Button variant='contained'
				disabled={callingAPI || file === null || datasetId === ""}
				onClick={addDataset}>
				{"Add Dataset" + (datasetId === "" ? " (add an id)" :
					file === null ? " (select a file)" : "")}
			</Button>
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
	return (<>
		<Stack>
			<h2>Insights for "{props.dataset.id}":</h2>
			<SectionGraphs dataset={props.dataset}/>
		</Stack>
	</>);
}

type AvgsByDeptData = Array<{ dept: string, count: number }>;

const SectionGraphs = (props: {
	dataset: InsightDataset,
}) => {
	const id = props.dataset.id;
	const [barData, setBarData] = useState<AvgsByDeptData>([]);
	const [courseAvgLimit, setCourseAvgLimit] = useState(80);
	const coursesToDisplayInChart = 12;

	useEffect(() => {
		getCoursesAvgOver(id, courseAvgLimit, coursesToDisplayInChart, setBarData);
	}, [props.dataset, id, courseAvgLimit]);

	return (<>
	<Typography>Sections insights:</Typography>
	<TextField
	label={"Course Average Lower Limit"}
	inputProps={{ type: 'number'}}
	value={courseAvgLimit}
	onChange={(e) => setCourseAvgLimit(Math.max(0, Math.min(parseInt(e.target.value), 100)))} />
	<Bar data={{
		labels: barData.map(x => x.dept),
		datasets: [
			{
				label: "Course Count Avg Over " + courseAvgLimit,
				data: barData.map(x => x.count)
			}
		]
	}}/>
	<TextField />
	</>);
};

const getCoursesAvgOver = (id: string,
	courseAvgLimit: number,
	topNCourses: number,
	setData: (d: AvgsByDeptData) => void): Promise<void> => {
		return requestQuery({
			"WHERE": {},
			"OPTIONS": {
				"COLUMNS": [id + "_title", "overallAvg", id + "_dept"]
			},
			"TRANSFORMATIONS": {
				"GROUP": [id + "_title", id + "_dept"],
				"APPLY": [{
					"overallAvg": {
						"AVG": id + "_avg"
					}
				}]
			}
		})
		.then((res) => {
			const deptsMappedToNumberAvgOver80 = new Map<string, number>();
			res.filter(x => x.overallAvg as number > courseAvgLimit)
				.map(x => x[id + "_dept"] as string).forEach(dept => {
					if (deptsMappedToNumberAvgOver80.has(dept)) {
						let numPrev = deptsMappedToNumberAvgOver80.get(dept)!;
						deptsMappedToNumberAvgOver80.set(dept, numPrev + 1);
					} else {
						deptsMappedToNumberAvgOver80.set(dept, 1);
					}
				});
			const top = Array.from(deptsMappedToNumberAvgOver80.entries())
				.map(x => ({
					dept: x[0] as string,
					count: x[1] as number,
				}))
				.sort((a, b) => (b.count as number) - (a.count as number))
				.slice(0, Math.min(topNCourses, deptsMappedToNumberAvgOver80.size));

			setData(top);
		})
		.catch(e => {
			console.error((e as any)?.message ?? e);
		});
}

export default App;

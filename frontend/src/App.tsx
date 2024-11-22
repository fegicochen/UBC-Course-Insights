import React, { useEffect, useMemo, useState } from 'react';
import logo from './logo.svg';
import './App.css';
import { Button, CircularProgress, Container, Divider, FormControl, Grid2 as Grid, InputLabel, MenuItem, Paper, Select, Stack, TextField, Typography } from '@mui/material';
import { InsightDataset, InsightResult, requestAddDataset, requestDatasets, requestQuery, requestRemoveDataset } from './Requests';
import { CategoryScale, Chart as ChartJS } from 'chart.js/auto'
import { Chart, Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale);

function App() {

	const [datasets, setDatasets] = useState<InsightDataset[]>([]);
	const [selectedDataset, setSelectedDataset] = useState<InsightDataset | undefined>();

	return (
		<Grid container
		padding={4}
		spacing={2}
		alignItems={'start'}
		justifyItems={'center'}
		textAlign={'center'}>
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
		<Stack spacing={2}>
			<h2>Insights for "{props.dataset.id}":</h2>
			<SectionGraphs dataset={props.dataset}/>
		</Stack>
	</>);
}

enum Insights {
	DeptsWithHighAvg,
	CompareTwo,
	CompareInstructors
}

const SectionGraphs = (props: {
	dataset: InsightDataset,
}) => {
	const id = props.dataset.id;
	const [insight, setInsight] = useState<undefined | Insights>(undefined);

	return (<>
	<Typography>Sections insights:</Typography>
	<FormControl fullWidth>
		<InputLabel id="insight">Select Insight</InputLabel>
		<Select
		labelId="insight"
		id="insight"
		value={insight}
		label="Select Insight"
		onChange={(e) => setInsight(e.target.value as any)}>
			<MenuItem value={Insights.DeptsWithHighAvg}>Departments With High Average Courses</MenuItem>
			<MenuItem value={Insights.CompareTwo}>Compare Two Courses</MenuItem>
			<MenuItem value={Insights.CompareInstructors}>Compare Averages For Instructors</MenuItem>
		</Select>
	</FormControl>
	{insight === Insights.DeptsWithHighAvg ?
	<Chart1 dataset={props.dataset}/>
	: insight === Insights.CompareTwo ?
	<Chart2 dataset={props.dataset}/>
	: insight === Insights.CompareInstructors ?
	<Chart3 dataset={props.dataset}/>
	: <></>}
	</>);
};

type AvgsByDeptData = { dept: string, count: number }[];

const Chart1 = (props: {
	dataset: InsightDataset
}) => {
	const id = props.dataset.id;
	const coursesToDisplayInChart = 12;
	const [barData, setBarData] = useState<AvgsByDeptData>([]);
	const [courseAvgLimit, setCourseAvgLimit] = useState(80);

	useEffect(() => {
		getCoursesAvgOver(id, courseAvgLimit, coursesToDisplayInChart, setBarData);
	}, [props.dataset, id, courseAvgLimit]);


	return (<>
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
	</>);
};

const Chart2 = (props: {
	dataset: InsightDataset
}) => {
	const id = props.dataset.id;
	const [barData, setBarData] = useState<{ name: string, avg: number }[]>([]);
	const [course1, setCourse1] = useState("");
	const [course2, setCourse2] = useState("");

	const getCourses = async () => {
		const d1 = await getSingleCourse(id, course1);
		const d2 = await getSingleCourse(id, course2);
		if ((d1 ?? []).length !== 0 && (d2 ?? []).length !== 0) {
			setBarData([{
				name: d1![0][id + "_dept"] as string + d1![0][id + "_id"] as string,
				avg: d1![0].avgMark as number
			}, {
				name: d2![0][id + "_dept"] as string + d2![0][id + "_id"] as string,
				avg: d2![0].avgMark  as number
			}])
		} else {
			setBarData([]);
		}
	};

	useEffect(() => {
		getCourses();
	}, [props.dataset, course1, course2])

	return (<>
	<Stack direction={'row'} spacing={1} width={"100%"}>
		<TextField label="Course 1" helperText={"ex. MATH 100"}
			value={course1}
			onChange={(e) => setCourse1(e.target.value)}/>
		<TextField label="Course 2" helperText={"ex. CPSC 121"}
			value={course2}
			onChange={(e) => setCourse2(e.target.value)}/>
		<Divider />
	</Stack>
	<Bar data={{
		labels: barData.map(x => x.name),
		datasets: [
			{
				label: "Course Average Over All Sections",
				data: barData.map(x => x.avg)
			}
		]
	}} />
	</>);
};


const Chart3 = (props: {
	dataset: InsightDataset
}) => {
	const id = props.dataset.id;
	const [barData, setBarData] = useState<{ instructor: string, avg: number }[]>([]);
	const [course, setCourse] = useState("");

	const getCourses = async () => {
		const d1 = await getCourseAveragesByProf(id, course);
		if ((d1 ?? []).length !== 0) {
			setBarData(d1!.map(x => ({
				instructor: x[id + "_instructor"] as string,
				avg: x.avgMark as number
			}))
			.filter(x => x.instructor !== "")
			.slice(0, 13))
		} else {
			setBarData([]);
		}
	};

	useEffect(() => {
		getCourses();
	}, [props.dataset, course])

	return (<>
	<TextField label="Course To Look At Instructors" helperText={"ex. CPCS 121"}
		value={course}
		onChange={(e) => setCourse(e.target.value)}/>
	<Bar data={{
		labels: barData.map(x => x.instructor),
		datasets: [
			{
				label: "Course Average Over All Sections",
				data: barData.map(x => x.avg)
			}
		]
	}} />
	</>);
};
const getCourseAveragesByProf = (id: string, course: string): Promise<InsightResult[] | undefined> => {
	const [dept, num] = course.trim().toLocaleLowerCase().split(" ");

	return requestQuery({
		"WHERE": {
			"AND": [
				{
					"IS": {
						[id + "_id"]: num
					}
				},
				{
					"IS": {
						[dept + "_dept"]: dept
					}
				}
			]
		},
		"OPTIONS": {
			"COLUMNS": [id + "_id", id + "_dept", "avgMark", id + "_instructor"],
			"ORDER": {
				"dir": "DOWN",
				"keys": ["avgMark"]
			}
		},
		"TRANSFORMATIONS": {
			"GROUP": [
				id + "_id", id + "_dept", id + "_instructor"
			],
			"APPLY": [
				{
					"avgMark": {
						"AVG": "sections_avg"
					}
				}
			]
		}
	})
	.then((res) => res)
	.catch((e) => {
		console.error((e as any)?.message ?? e);
		return undefined;
	});
};

const getSingleCourse = (id: string, course: string)
	: Promise<InsightResult[] | undefined> => {
	const [dept, num] = course.trim().toLocaleLowerCase().split(" ");

	return requestQuery({
		"WHERE": {
			"AND": [
				{
					"IS": {
						[id + "_id"]: num
					}
				},
				{
					"IS": {
						[dept + "_dept"]: dept
					}
				}
			]
		},
		"OPTIONS": {
			"COLUMNS": [id + "_id", id + "_dept", "avgMark"]
		},
		"TRANSFORMATIONS": {
			"GROUP": [
				id + "_id", id + "_dept"
			],
			"APPLY": [
				{
					"avgMark": {
						"AVG": "sections_avg"
					}
				}
			]
		}
	})
	.then((res) => {
		return res;
	})
	.catch((e) => {
		console.error((e as any)?.message ?? e);
		return undefined;
	});
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

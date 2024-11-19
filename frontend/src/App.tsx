import React, { useEffect, useMemo, useState } from 'react';
import logo from './logo.svg';
import './App.css';
import { Button, Container, Divider, Grid2 as Grid, Paper, Stack, Typography } from '@mui/material';
import { InsightDataset, requestDatasets, requestRemoveDataset } from './Requests';

function App() {

	const [datasets, setDatasets] = useState<InsightDataset[]>([]);
	const [fetchingDatasets, setFetchingDatasets] = useState(false);

	const updateDatasets = async (): Promise<void> => {
		setFetchingDatasets(true);
		return requestDatasets()
			.catch(e => {
				console.error("GET DATASETS ERROR: " + e.message);
			})
			.then(res => {
				console.log(JSON.stringify(res));
				setDatasets(res as InsightDataset[]);
			})
			.finally(() => {
				setFetchingDatasets(false);
			});
	};

	const removeDataset = (id: string) => {
		setFetchingDatasets(true);
		requestRemoveDataset(id)
			.catch(e => {
				console.error("REMOVE DATASETS ERROR: " + e.message);
			})
			.then(res => {
				console.log(JSON.stringify(res));
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
					<Button variant='contained' disabled={fetchingDatasets}>Add Dataset</Button>
					<Button variant='contained' onClick={updateDatasets} disabled={fetchingDatasets}>Refresh Dataset List</Button>
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

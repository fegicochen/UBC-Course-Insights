import { Keywords, InsightFacadeKey, OptionsState } from "./Dataset";
import { DatasetUtils } from "./Dataset";
import { InsightError } from "./IInsightFacade";

export class OptionsProcessor {
	private datasetId!: string;

	constructor(private optionsRaw: unknown, private applyKeys: string[]) {}

	/**
	 * Processes the raw options object and returns the structured OptionsState.
	 * @throws InsightError if options are malformed.
	 */
	public processOptions(): OptionsState {
		const options = DatasetUtils.checkIsObject(Keywords.Options, this.optionsRaw);
		const optionsStructure = DatasetUtils.requireExactKeys(options, [
			[Keywords.Columns, true],
			[Keywords.Order, false],
		]);

		const [columnsForState, datasetIdForState] = this.parseColumns(optionsStructure);
		this.datasetId = datasetIdForState;
		const orderForState = this.processOrder(optionsStructure, datasetIdForState);

		if (
			orderForState !== undefined &&
			columnsForState.find((col) => col.field === orderForState?.field) === undefined
		) {
			throw new InsightError("Order field not selected in columns.");
		}

		return {
			columns: columnsForState,
			order: orderForState,
			datasetId: datasetIdForState,
		};
	}

	/**
	 * Parses the columns from the options structure
	 * @param optionsStructure The structured options map
	 * @returns A tuple containing the columns and dataset ID
	 * @throws InsightError if columns are malformed
	 */
	private parseColumns(optionsStructure: Map<string, unknown>): [InsightFacadeKey[], string] {
		const columnsForState: InsightFacadeKey[] = [];
		let datasetIdForState: string | undefined;

		// Process the columns in the options
		const columns = DatasetUtils.checkIsArray(Keywords.Columns, optionsStructure.get(Keywords.Columns));
		columns.forEach((columnRaw) => {
			const column = DatasetUtils.checkIsString(Keywords.Columns, columnRaw);

			// Check if column is an apply key
			if (this.applyKeys.includes(column)) {
				// Store apply key with an empty idstring since it doesn’t belong to a dataset
				columnsForState.push({ idstring: "", field: column as any });
			} else {
				// Try parsing as a dataset key (mkey or skey)
				const columnKey = DatasetUtils.parseMOrSKey(column);
				if (columnKey !== undefined) {
					// Ensure all dataset keys use the same dataset
					if (datasetIdForState !== undefined && datasetIdForState !== columnKey.idstring) {
						throw new InsightError("Multiple datasets used in query. Only one allowed.");
					} else {
						datasetIdForState = columnKey.idstring;
					}
					columnsForState.push(columnKey);
				} else {
					throw new InsightError(`Improper column key formatting: ${column}.`);
				}
			}
		});

		// Ensure at least one valid dataset key or apply key is selected
		if (
			columnsForState.length === 0 ||
			(datasetIdForState === undefined && columnsForState.every((col) => col.idstring === ""))
		) {
			throw new InsightError("Query must select at least one valid column.");
		}

		return [columnsForState, datasetIdForState || ""];
	}

	/**
	 * Processes the order from the options structure.
	 * @param optionsStructure The structured options map.
	 * @param datasetIdForState The dataset ID extracted from columns.
	 * @returns The order key if present, otherwise undefined.
	 * @throws InsightError if order is malformed.
	 */
	private processOrder(
		optionsStructure: Map<string, unknown>,
		datasetIdForState: string
	): InsightFacadeKey | undefined {
		let orderForState: InsightFacadeKey | undefined;
		if (optionsStructure.has(Keywords.Order) && optionsStructure.get(Keywords.Order) !== undefined) {
			const order = DatasetUtils.checkIsString(Keywords.Order, optionsStructure.get(Keywords.Order));
			const orderKey = DatasetUtils.parseMOrSKey(order);
			if (orderKey !== undefined) {
				orderForState = orderKey;
				if (orderKey.idstring !== datasetIdForState) {
					throw new InsightError("Multiple datasets used in query. Only one allowed.");
				}
			} else {
				throw new InsightError("Order is not a valid ID string: " + order + ".");
			}
		}
		return orderForState;
	}

	/**
	 * Retrieves the dataset ID processed.
	 * @returns The dataset ID as a string.
	 */
	public getDatasetId(): string {
		return this.datasetId;
	}
}

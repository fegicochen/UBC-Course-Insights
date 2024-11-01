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

		// Create a set of column keys for validation
		const columnsSet = new Set(
			columnsForState.map((col) => (col.idstring ? `${col.idstring}_${col.field}` : col.field))
		);

		const orderForState = this.processOrder(optionsStructure, datasetIdForState, columnsSet);

		return {
			columns: columnsForState,
			order: orderForState,
			datasetKind: datasetIdForState,
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

		// Ensure at least one valid dataset key is selected
		if (columnsForState.length === 0 || datasetIdForState === undefined) {
			throw new InsightError("Query must select at least one valid column.");
		}

		return [columnsForState, datasetIdForState];
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
		datasetIdForState: string,
		columnsSet: Set<string>
	): { dir: "UP" | "DOWN"; keys: string[] } | undefined {
		if (optionsStructure.has(Keywords.Order) && optionsStructure.get(Keywords.Order) !== undefined) {
			const orderRaw = optionsStructure.get(Keywords.Order);
			if (typeof orderRaw === "string") {
				// Simple ORDER syntax
				const orderKey = this.parseOrderKey(orderRaw, datasetIdForState, columnsSet);
				return { dir: "UP", keys: [orderKey] };
			} else if (typeof orderRaw === "object" && orderRaw !== null) {
				// Complex ORDER syntax
				const orderObj = orderRaw as any;
				const dir = orderObj.dir;
				const keys = orderObj.keys;

				if ((dir === "UP" || dir === "DOWN") && Array.isArray(keys) && keys.length > 0) {
					// Validate that all keys are in columns
					keys.forEach((key: string) => {
						this.parseOrderKey(key, datasetIdForState, columnsSet);
					});
					return { dir, keys };
				} else {
					throw new InsightError("Invalid ORDER format.");
				}
			} else {
				throw new InsightError("ORDER must be a string or an object.");
			}
		}
		return undefined;
	}

	private parseOrderKey(key: string, datasetIdForState: string, columnsSet: Set<string>): string {
		if (!columnsSet.has(key)) {
			throw new InsightError(`Sort key ${key} must be included in COLUMNS.`);
		}
		// Check if key is an apply key
		if (this.applyKeys.includes(key)) {
			return key;
		}
		const orderKey = DatasetUtils.parseMOrSKey(key);
		if (orderKey !== undefined) {
			if (orderKey.idstring !== datasetIdForState) {
				throw new InsightError("Multiple datasets used in query. Only one allowed.");
			}
			return key;
		} else {
			throw new InsightError(`Order key ${key} is not a valid key.`);
		}
	}

	/**
	 * Retrieves the dataset ID processed.
	 * @returns The dataset ID as a string.
	 */
	public getDatasetId(): string {
		return this.datasetId;
	}
}

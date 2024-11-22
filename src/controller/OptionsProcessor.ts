import { Keywords, InsightFacadeKey, OptionsState } from "./Dataset";
import { DatasetUtils, Transformations } from "./Dataset";
import { InsightError } from "./IInsightFacade";

export class OptionsProcessor {
	private datasetId!: string;

	constructor(private optionsRaw: unknown, private applyKeys: string[]) {}

	/**
	 * Processes the raw options object and returns the structured OptionsState.
	 * @throws InsightError if options are malformed.
	 */
	/**
	 * Processes the raw options object and returns the structured OptionsState.
	 * @param transformations Optional Transformations object from the query.
	 * @returns The structured OptionsState.
	 * @throws InsightError if options are malformed or validation fails.
	 */
	public processOptions(transformations?: Transformations): OptionsState {
		// Ensure the optionsRaw is an object
		const options = DatasetUtils.checkIsObject(Keywords.Options, this.optionsRaw);

		// Ensure the options have exactly the required keys
		const optionsStructure = DatasetUtils.requireExactKeys(options, [
			[Keywords.Columns, true],
			[Keywords.Order, false],
		]);

		// Parse the columns and extract the dataset ID if present
		const [columnsForState, datasetIdForState] = this.parseColumns(optionsStructure);

		// Assign the datasetId if it was identified from the columns
		if (datasetIdForState !== undefined) {
			this.datasetId = datasetIdForState;
		}

		// Infer and validate the dataset kind based on transformations and group keys
		this.inferAndValidateDatasetKind(transformations);

		// Validate that all columns are present in GROUP or APPLY
		this.validateColumnsInGroupOrApply(columnsForState, transformations);

		// Create a set of column keys for validation in ORDER
		const columnsSet = new Set(
			columnsForState.map((col) => (col.idstring ? `${col.idstring}_${col.field}` : col.field))
		);

		// Ensure that at least one column is present
		if (columnsForState.length === 0) {
			throw new InsightError("Query must select at least one valid column.");
		}

		// Process the ORDER specification
		const orderForState = this.processOrder(optionsStructure, this.datasetId, columnsSet);

		return {
			columns: columnsForState,
			order: orderForState,
			datasetId: this.datasetId,
		};
	}

	/**
	 * Infers the datasetKind from TRANSFORMATIONS.GROUP if not already set and validates GROUP keys.
	 * @param transformations Optional Transformations object from the query.
	 * @throws InsightError if datasetKind cannot be inferred or GROUP keys are invalid.
	 */
	private inferAndValidateDatasetKind(transformations?: Transformations): void {
		// If datasetId is not set and transformations are provided, infer from GROUP keys
		if (!this.datasetId && transformations) {
			if (transformations.GROUP.length === 0) {
				throw new InsightError("TRANSFORMATIONS.GROUP must have at least one key.");
			}

			const firstGroupKey = transformations.GROUP[0];
			const groupKeyParsed = DatasetUtils.parseMOrSKey(firstGroupKey);
			if (!groupKeyParsed) {
				throw new InsightError(`Invalid GROUP key format: "${firstGroupKey}".`);
			}

			this.datasetId = groupKeyParsed.idstring;

			// Ensure all GROUP keys belong to the same dataset kind
			transformations.GROUP.forEach((groupKey) => {
				const parsedKey = DatasetUtils.parseMOrSKey(groupKey);
				if (!parsedKey || parsedKey.idstring !== this.datasetId) {
					throw new InsightError(`GROUP key "${groupKey}" does not match dataset kind "${this.datasetId}".`);
				}
			});
		}

		// If datasetId is still undefined after attempting to infer, throw an error
		if (!this.datasetId) {
			throw new InsightError("Query must select at least one valid column.");
		}
	}

	/**
	 * Validates that all columns are present in either GROUP or APPLY when transformations are used.
	 * @param columnsFState The parsed columns from COLUMNS.
	 * @param transformations Optional Transformations object from the query.
	 * @throws InsightError if any column is not present in GROUP or APPLY.
	 */
	private validateColumnsInGroupOrApply(columnsFState: InsightFacadeKey[], transformations?: Transformations): void {
		if (transformations) {
			const groupKeys = new Set(transformations.GROUP);
			const applyKeysSet = new Set(this.applyKeys);

			columnsFState.forEach((column) => {
				if (column.idstring === "") {
					// APPLY keys should already be validated to exist in APPLY
					if (!applyKeysSet.has(column.field)) {
						throw new InsightError(`APPLY key "${column.field}" not found.`);
					}
				} else {
					// GROUP keys must be present in GROUP or as an APPLY key
					const groupKey = `${column.idstring}_${column.field}`;
					if (!groupKeys.has(groupKey) && !applyKeysSet.has(column.field)) {
						throw new InsightError(`Key "${groupKey}" must be present in GROUP or as an APPLY key.`);
					}
				}
			});
		}
	}

	/**
	 * Parses the columns from the options structure
	 * @param optionsStructure The structured options map
	 * @returns A tuple containing the columns and dataset ID
	 * @throws InsightError if columns are malformed
	 */
	private parseColumns(optionsStructure: Map<string, unknown>): [InsightFacadeKey[], string | undefined] {
		const columnsForState: InsightFacadeKey[] = [];
		let datasetKindForState: string | undefined;

		const columns = DatasetUtils.checkIsArray(Keywords.Columns, optionsStructure.get(Keywords.Columns));
		columns.forEach((columnRaw) => {
			const column = DatasetUtils.checkIsString(Keywords.Columns, columnRaw);

			if (this.applyKeys.includes(column)) {
				columnsForState.push({ idstring: "", field: column as any });
			} else {
				const columnKey = DatasetUtils.parseMOrSKey(column);
				if (columnKey !== undefined) {
					if (datasetKindForState !== undefined && datasetKindForState !== columnKey.idstring) {
						throw new InsightError("Multiple datasets used in query. Only one kind allowed.");
					} else {
						datasetKindForState = columnKey.idstring;
					}
					columnsForState.push(columnKey);
				} else {
					throw new InsightError(`Improper column key formatting: ${column}.`);
				}
			}
		});

		return [columnsForState, datasetKindForState];
	}

	/**
	 * Processes the order from the options structure.
	 * @param optionsStructure The structured options map.
	 * @param datasetIdForState The dataset ID extracted from columns.
	 * @param columnsSet The set of column keys.
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

				if (
					(dir === "UP" || dir === "DOWN") &&
					Array.isArray(keys) &&
					keys.length > 0 &&
					keys.every((key: any) => typeof key === "string")
				) {
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
				throw new InsightError("Sort key belongs to a different dataset kind.");
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

import { InsightError } from "./IInsightFacade";
import { Keywords, ApplyRule, DatasetUtils } from "./Dataset";
import { calculateMax, calculateMin, calculateSum, calculateCount, calculateAvg } from "./Calculations";

/**
 * ApplyProcessor handles the APPLY operations in a query.
 */
export class ApplyProcessor {
	private datasetId: string;

	constructor(datasetId: string) {
		this.datasetId = datasetId;
	}

	/**
	 * Processes a single APPLY rule and returns the result.
	 * @param applyRule The APPLY rule to process.
	 * @param items The array of items to apply the rule on.
	 * @returns The result of the APPLY operation.
	 * @throws InsightError if the APPLY rule is invalid or the operation fails.
	 */
	public processApplyRule(applyRule: ApplyRule, items: any[]): any {
		// Validate the APPLY rule structure and contents
		this.validateApplyRule(applyRule);

		// Extract the apply key and operation details
		const applyKey = Object.keys(applyRule)[0];
		const applyObject = applyRule[applyKey];
		const [operation, field] = Object.entries(applyObject)[0];

		// Get the actual field name without dataset prefix
		const fieldName = this.getFieldName(field);

		// Validate and parse the field key
		const fieldKey = DatasetUtils.parseMOrSKey(field);
		if (!fieldKey) {
			throw new InsightError(`Invalid field key: ${field}`);
		}

		// Ensure the operation is compatible with the field type
		if (this.isNumericOperation(operation) && !DatasetUtils.isMKey(fieldKey)) {
			throw new InsightError(`Operation ${operation} requires a numeric field, but ${field} is not numeric.`);
		}

		// Extract values for the target field from all items
		const values = items.map((item: Record<string, any>) => item[fieldName]);

		// Execute the specified APPLY operation
		const operationFunc = this.getOperationFunction(operation);
		if (!operationFunc) {
			throw new InsightError(`Invalid APPLY token: ${operation}`);
		}

		return operationFunc(values);
	}

	/**
	 * Validates the structure and contents of an APPLY rule.
	 * Utilizes helper functions from DatasetUtils for validation.
	 * @param applyRule The APPLY rule to validate.
	 * @throws InsightError if the APPLY rule is malformed or contains invalid data.
	 */
	private validateApplyRule(applyRule: ApplyRule): void {
		// Ensure APPLY rule is an object
		DatasetUtils.checkIsObject("APPLY rule", applyRule);

		// Ensure APPLY rule has exactly one key (the apply key)
		const applyKeys = Object.keys(applyRule);
		if (applyKeys.length !== 1) {
			throw new InsightError("APPLY rule must have exactly one key.");
		}

		const applyKey = applyKeys[0];
		const applyObject = applyRule[applyKey];

		// Ensure the APPLY operation is an object
		DatasetUtils.checkIsObject("APPLY operation", applyObject);

		// Ensure the APPLY operation has exactly one key (the operation type)
		const operations = Object.keys(applyObject);
		if (operations.length !== 1) {
			throw new InsightError("APPLY operation must have exactly one operation type.");
		}

		const operation = operations[0];
		const supportedOperations = ["MAX", "MIN", "AVG", "COUNT", "SUM"];
		if (!supportedOperations.includes(operation)) {
			throw new InsightError(`Unsupported APPLY operation: ${operation}`);
		}

		const targetKey = applyObject[operation];

		// Ensure the target key is a string
		DatasetUtils.checkIsString("APPLY target key", targetKey);

		// Parse and validate the target key format and dataset kind
		const parsedKey = DatasetUtils.parseMOrSKey(targetKey);
		if (!parsedKey || parsedKey.idstring !== this.datasetId) {
			throw new InsightError("APPLY target key does not match dataset kind.");
		}
	}

	/**
	 * Executes the specified APPLY operation on the target key.
	 * @param operation The APPLY operation to perform (e.g., MAX, MIN).
	 * @param targetKey The key to perform the operation on.
	 * @param items The group of items to apply the operation to.
	 * @returns The result of the APPLY operation.
	 * @throws InsightError if the operation is unsupported or if data processing fails.
	 */
	private executeApplyOperation(operation: string, targetKey: string, items: any[]): any {
		// Extract the values for the target key from all items
		const values = items.map((item) => item[targetKey]);

		switch (operation) {
			case "MAX":
				return calculateMax(values);
			case "MIN":
				return calculateMin(values);
			case "AVG":
				return calculateAvg(values);
			case "SUM":
				return calculateSum(values);
			case "COUNT":
				return calculateCount(values);
			default:
				throw new InsightError(`Unsupported APPLY operation: ${operation}`);
		}
	}

	/**
	 * Determines the correct field name by removing the dataset kind prefix if present.
	 * @param field The field name with potential prefix.
	 * @returns The processed field name.
	 */
	private getFieldName(field: string): string {
		const prefix = `${this.datasetId}_`;
		return field.startsWith(prefix) ? field.slice(prefix.length) : field;
	}

	/**
	 * Determines if an operation requires numeric fields.
	 * @param operation The operation to check.
	 * @returns True if numeric operation, else false.
	 */
	private isNumericOperation(operation: string): boolean {
		return [
			Keywords.ApplyToken.Max,
			Keywords.ApplyToken.Min,
			Keywords.ApplyToken.Sum,
			Keywords.ApplyToken.Avg,
		].includes(operation);
	}

	/**
	 * Maps APPLY tokens to their corresponding calculation functions.
	 * @param operation The APPLY token.
	 * @returns The corresponding calculation function.
	 */
	private getOperationFunction(operation: string): ((vals: any[]) => any) | undefined {
		const operationsMap: Record<string, (vals: any[]) => any> = {
			[Keywords.ApplyToken.Max]: calculateMax,
			[Keywords.ApplyToken.Min]: calculateMin,
			[Keywords.ApplyToken.Sum]: calculateSum,
			[Keywords.ApplyToken.Count]: calculateCount,
			[Keywords.ApplyToken.Avg]: calculateAvg,
		};
		return operationsMap[operation];
	}
}

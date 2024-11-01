import { InsightError } from "./IInsightFacade";
import { Keywords, ApplyRule, DatasetUtils } from "./Dataset";
import { calculateMax, calculateMin, calculateSum, calculateCount, calculateAvg } from "./Calculations";

/**
 * ApplyProcessor handles the APPLY operations in a query.
 */
export class ApplyProcessor {
	private datasetKind: string;

	constructor(datasetKind: string) {
		this.datasetKind = datasetKind;
	}

	/**
	 * Processes a single APPLY rule and returns the result.
	 * @param applyRule The APPLY rule to process.
	 * @param items The array of items to apply the rule on.
	 * @returns The result of the APPLY operation.
	 */
	public processApplyRule(applyRule: ApplyRule, items: any[]): any {
		const applyKey = Object.keys(applyRule)[0];
		const applyObject = applyRule[applyKey];
		const [operation, field] = Object.entries(applyObject)[0];

		const fieldName = this.getFieldName(field);
		const fieldKey = DatasetUtils.parseMOrSKey(field);
		if (!fieldKey) {
			throw new InsightError(`Invalid field key: ${field}`);
		}

		// Validate that the field type matches the operation
		if (this.isNumericOperation(operation) && !DatasetUtils.isMKey(fieldKey)) {
			throw new InsightError(`Operation ${operation} requires a numeric field, but ${field} is not numeric.`);
		}

		const values = items.map((item: Record<string, any>) => item[fieldName]);

		const operationFunc = this.getOperationFunction(operation);
		if (!operationFunc) {
			throw new InsightError(`Invalid APPLY token: ${operation}`);
		}

		return operationFunc(values);
	}

	/**
	 * Determines the correct field name by removing the dataset kind prefix if present.
	 * @param field The field name with potential prefix.
	 * @returns The processed field name.
	 */
	private getFieldName(field: string): string {
		const prefix = `${this.datasetKind}_`;
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

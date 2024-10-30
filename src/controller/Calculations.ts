import Decimal from "decimal.js";

const two = 2;

/**
 * Finds the maximum value in an array of numbers
 */
export function calculateMax(values: number[]): number {
	return Math.max(...values);
}

/**
 * Finds the minimum value in an array of numbers
 */
export function calculateMin(values: number[]): number {
	return Math.min(...values);
}

/**
 * Sums an array of numbers, rounding the result to two decimal places
 */
export function calculateSum(values: number[]): number {
	const sumDecimal = values.reduce((acc, value) => acc.add(new Decimal(value)), new Decimal(0));
	return Number(sumDecimal.toFixed(two));
}

/**
 * Counts unique values in an array
 */
export function calculateCount(values: any[]): number {
	return new Set(values).size;
}

/**
 * Calculates the average of an array of numbers, rounded to two decimal places
 */
export function calculateAvg(values: number[]): number {
	const total = values.reduce((acc, value) => acc.add(new Decimal(value)), new Decimal(0));
	const avgNumber = total.toNumber() / values.length;
	return Number(avgNumber.toFixed(two));
}

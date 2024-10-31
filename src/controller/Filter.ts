import { InsightFacadeKey, Dataset } from "./Dataset";
import { InsightError } from "./IInsightFacade";

enum FilterName {
	And,
	Or,
	LessThan,
	GreaterThan,
	Equals,
	Is,
	Not,
	All,
}

export interface FilterOperation<T extends object> {
	name: FilterName;
	apply: () => T[];
}

export interface FilterStrategy<T extends object, FO extends FilterOperation<T>> {
	or(children: FO[]): FO;
	and(children: FO[]): FO;
	lessThan(limit: number, mkey: InsightFacadeKey): FO;
	greaterThan(limit: number, mkey: InsightFacadeKey): FO;
	equals(limit: number, mkey: InsightFacadeKey): FO;
	is(compare: string, skey: InsightFacadeKey): FO;
	not(child: FO): FO;
	all(): FO;
}

export class FilterOperationByDataset<T extends object> implements FilterOperation<T> {
	private readonly dataset: Dataset<T>;
	public readonly name: FilterName;
	private readonly children?: FilterOperationByDataset<T>[];
	private readonly num?: number;
	private readonly str?: string;
	private readonly key?: InsightFacadeKey;

	/**
	 *
	 * @param dataset the dataset to use for this query
	 * @param name the name of the filter
	 * @param children children if this filter has children (AND, OR)
	 * @param num a number argument if this filter has one (EQ, LT, GT)
	 * @param str a string argument if this filter has one (IS)
	 * @param key a key argument if this filter has one (EQ, LT, GT, IS)
	 */
	constructor(params: {
		dataset: Dataset<T>;
		name: FilterName;
		children?: FilterOperationByDataset<T>[];
		num?: number;
		str?: string;
		key?: InsightFacadeKey;
	}) {
		this.name = params.name;
		this.dataset = params.dataset;
		this.children = params.children;
		this.num = params.num;
		this.str = params.str;
		this.key = params.key;
	}

	public apply(): T[] {
		const selected: T[] = [];
		for (const item of this.dataset.members) {
			// Early abort if too many
			// if (selected.length > maxResults) {
			// 	throw new ResultTooLargeError();
			// }
			// Check item valid under filter
			if (FilterOperationByDataset.test(this, item)) {
				selected.push(item);
			}
		}
		return selected;
	}

	/**
	 *
	 * @param operation the root filter operation to process
	 * @param item the item to validate
	 * @returns whether the given item is valid under the given filter operation
	 */
	private static test<T extends object>(operation: FilterOperationByDataset<T>, item: T): boolean {
		switch (operation.name) {
			case FilterName.All:
				return true;
			case FilterName.Equals:
				// Type assertion to Record<string, any> to inform TypeScript about dynamic keys
				return (item as Record<string, any>)[operation.key!.field] === operation.num!;
			case FilterName.Is:
				return this.validateFilterString(operation.str!, (item as Record<string, any>)[operation.key!.field]);
			case FilterName.GreaterThan:
				return (item as Record<string, any>)[operation.key!.field] > operation.num!;
			case FilterName.LessThan:
				return (item as Record<string, any>)[operation.key!.field] < operation.num!;
			case FilterName.Not:
				return !this.test(operation.children![0], item);
			case FilterName.And:
				return operation.children!.every((child) => this.test(child, item));
			case FilterName.Or:
				return operation.children!.some((child) => this.test(child, item));
			default:
				throw new InsightError("Unexpected filter name: " + operation.name);
		}
	}

	/**
	 * Takes care of asterisks in string to filter
	 *
	 * @param filterStr the string provided in the filter
	 * @param itemStr the item string to test against
	 */
	private static validateFilterString(filterStr: string, itemStr: string): boolean {
		if (filterStr === "") {
			return "" === itemStr;
		}

		const aStart = filterStr.startsWith("*");
		const aEnd = filterStr.endsWith("*");
		const startCharRemoved = filterStr.substring(1, filterStr.length);
		const endCharRemoved = filterStr.substring(0, filterStr.length - 1);
		const startAndEndCharsRemoved = filterStr.length === 1 ? "" : filterStr.substring(1, filterStr.length - 1);

		if (startAndEndCharsRemoved.includes("*")) {
			throw new InsightError("Asterisk must occur at start or end of string");
		}

		if (aStart && aEnd) {
			return itemStr.includes(startAndEndCharsRemoved);
		} else if (aStart) {
			return itemStr.endsWith(startCharRemoved);
		} else if (aEnd) {
			return itemStr.startsWith(endCharRemoved);
		} else if (filterStr.includes("*")) {
			throw new InsightError("Asterisk must occur at start or end of string");
		} else {
			return filterStr === itemStr;
		}
	}
}

export class FilterByDataset<T extends object> implements FilterStrategy<T, FilterOperationByDataset<T>> {
	private dataset: Dataset<T>;

	/**
	 *
	 * @param dataset the dataset to use for filtering
	 */
	constructor(dataset: Dataset<T>) {
		this.dataset = dataset;
	}

	public or(children: FilterOperationByDataset<T>[]): FilterOperationByDataset<T> {
		return new FilterOperationByDataset<T>({
			dataset: this.dataset,
			name: FilterName.Or,
			children: children,
		});
	}

	public and(children: FilterOperationByDataset<T>[]): FilterOperationByDataset<T> {
		return new FilterOperationByDataset<T>({
			dataset: this.dataset,
			name: FilterName.And,
			children: children,
		});
	}

	public lessThan(limit: number, mkey: InsightFacadeKey): FilterOperationByDataset<T> {
		return new FilterOperationByDataset<T>({
			dataset: this.dataset,
			name: FilterName.LessThan,
			key: mkey,
			num: limit,
		});
	}

	public greaterThan(limit: number, mkey: InsightFacadeKey): FilterOperationByDataset<T> {
		return new FilterOperationByDataset<T>({
			dataset: this.dataset,
			name: FilterName.GreaterThan,
			key: mkey,
			num: limit,
		});
	}

	public equals(limit: number, mkey: InsightFacadeKey): FilterOperationByDataset<T> {
		return new FilterOperationByDataset<T>({
			dataset: this.dataset,
			name: FilterName.Equals,
			key: mkey,
			num: limit,
		});
	}

	public is(compare: string, skey: InsightFacadeKey): FilterOperationByDataset<T> {
		return new FilterOperationByDataset<T>({
			dataset: this.dataset,
			name: FilterName.Is,
			key: skey,
			str: compare,
		});
	}

	public not(child: FilterOperationByDataset<T>): FilterOperationByDataset<T> {
		return new FilterOperationByDataset<T>({
			dataset: this.dataset,
			name: FilterName.Not,
			children: [child],
		});
	}

	public all(): FilterOperationByDataset<T> {
		return new FilterOperationByDataset<T>({
			dataset: this.dataset,
			name: FilterName.All,
		});
	}
}

import { Dataset, InsightFacadeKey, maxResults, Section } from "./Dataset";
import { InsightError, ResultTooLargeError } from "./IInsightFacade";

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

export interface FilterOperation {
	name: FilterName;
	apply: () => Section[];
}

export interface FilterStrategy<FO extends FilterOperation> {
	or(children: FO[]): FO;
	and(children: FO[]): FO;
	lessThan(limit: number, mkey: InsightFacadeKey): FO;
	greaterThan(limit: number, mkey: InsightFacadeKey): FO;
	equals(limit: number, mkey: InsightFacadeKey): FO;
	is(compare: string, skey: InsightFacadeKey): FO;
	not(child: FO): FO;
	all(): FO;
}

class FilterOperationBySection implements FilterOperation {
	private readonly dataset: Dataset;
	public readonly name: FilterName;
	private readonly children?: FilterOperationBySection[];
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
		dataset: Dataset;
		name: FilterName;
		children?: FilterOperationBySection[];
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

	public apply(): Section[] {
		const selected: Section[] = [];
		for (const section of this.dataset.members) {
			// Early abort if too many
			if (selected.length > maxResults) {
				throw new ResultTooLargeError();
			}
			// Check section valid under filter
			if (FilterOperationBySection.test(this, section)) {
				selected.push(section);
			}
		}
		return selected;
	}

	/**
	 *
	 * @param operation the root filter operation to process
	 * @param section the section to validate
	 * @returns whether the given section is valid under the given filter operation
	 */
	private static test(operation: FilterOperationBySection, section: Section): boolean {
		switch (operation.name) {
			case FilterName.All:
				return true;
			case FilterName.Equals:
				return section[operation.key!!.field] === operation.num!!;
			case FilterName.Is:
				return this.validateFilterString(operation.str!!, section[operation.key!!.field] as string);
			case FilterName.GreaterThan:
				return (section[operation.key!!.field] as number) > operation.num!!;
			case FilterName.LessThan:
				return (section[operation.key!!.field] as number) < operation.num!!;
			case FilterName.Not:
				return !this.test(operation.children!![0], section);
			case FilterName.And:
				for (const child of operation.children!!) {
					if (!this.test(child, section)) {
						return false;
					}
				}
				return true;
			case FilterName.Or:
				for (const child of operation.children!!) {
					if (this.test(child, section)) {
						return true;
					}
				}
				return false;
			default:
				throw new InsightError("Unexpected filter name: " + operation.name);
		}
	}

	/**
	 * Takes care of asterisks in string to filter
	 *
	 * @param filterStr the string provided in the filter
	 * @param sectionStr the section string to test against
	 */
	private static validateFilterString(filterStr: string, sectionStr: string): boolean {
		if (filterStr === "") {
			return "" === sectionStr;
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
			return sectionStr.includes(startAndEndCharsRemoved);
		} else if (aStart) {
			return sectionStr.endsWith(startCharRemoved);
		} else if (aEnd) {
			return sectionStr.startsWith(endCharRemoved);
		} else if (filterStr.includes("*")) {
			throw new InsightError("Asterisk must occur at start or end of string");
		} else {
			return filterStr === sectionStr;
		}
	}
}

export class FilterBySection implements FilterStrategy<FilterOperationBySection> {
	private dataset: Dataset;

	/**
	 *
	 * @param dp the datasets provider
	 * @param options the options for the given query
	 */
	constructor(dataset: Dataset) {
		this.dataset = dataset;
	}

	public or(children: FilterOperationBySection[]): FilterOperationBySection {
		return new FilterOperationBySection({
			dataset: this.dataset,
			name: FilterName.Or,
			children: children,
		});
	}

	public and(children: FilterOperationBySection[]): FilterOperationBySection {
		return new FilterOperationBySection({
			dataset: this.dataset,
			name: FilterName.And,
			children: children,
		});
	}
	public lessThan(limit: number, mkey: InsightFacadeKey): FilterOperationBySection {
		return new FilterOperationBySection({
			dataset: this.dataset,
			name: FilterName.LessThan,
			key: mkey,
			num: limit,
		});
	}
	public greaterThan(limit: number, mkey: InsightFacadeKey): FilterOperationBySection {
		return new FilterOperationBySection({
			dataset: this.dataset,
			name: FilterName.GreaterThan,
			key: mkey,
			num: limit,
		});
	}

	public equals(limit: number, mkey: InsightFacadeKey): FilterOperationBySection {
		return new FilterOperationBySection({
			dataset: this.dataset,
			name: FilterName.Equals,
			key: mkey,
			num: limit,
		});
	}

	public is(compare: string, skey: InsightFacadeKey): FilterOperationBySection {
		return new FilterOperationBySection({
			dataset: this.dataset,
			name: FilterName.Is,
			key: skey,
			str: compare,
		});
	}

	public not(child: FilterOperationBySection): FilterOperationBySection {
		return new FilterOperationBySection({
			dataset: this.dataset,
			name: FilterName.Not,
			children: [child],
		});
	}

	public all(): FilterOperationBySection {
		return new FilterOperationBySection({
			dataset: this.dataset,
			name: FilterName.All,
		});
	}
}

// type MOpComparator = (x: number, y: number) => boolean;
// /**
//  * A class to manage filter tree structure in a functional manner.
//  * Contains methods or, and, lessThan, etc. which consume a child, children, or parameters
//  * and return a function which computes the value with the provided dataset.
//  *
//  * Ex. `
//  * const f = new Filter(dp, options);
//  * f.or([f.equals(12, mkey), f.is("abc", skey)]);
//  * `
//  */
// export class FilterBySet implements FilterStrategy<FilterOperation> {
// 	private dataset: Dataset;

// 	/**
// 	 *
// 	 * @param dp the datasets provider
// 	 * @param options the options for the given query
// 	 */
// 	constructor(dataset: Dataset) {
// 		this.dataset = dataset;
// 	}

// 	/**
// 	 *
// 	 * @param children the filter operations to be "or'ed" together
// 	 * @returns A function evaluating the "or" (set union) of the results of the given filter operations.
// 	 */
// 	public or = (children: FilterOperation[]): FilterOperation => ({
// 		name: FilterName.Or,
// 		apply: (): Section[] => {
// 			const resultSet = new Set<Section>();
// 			children
// 				.map((child) => child.apply())
// 				.forEach((sectionList) => sectionList.forEach((section) => resultSet.add(section)));
// 			return Array.from(resultSet);
// 		},
// 	});

// 	/**
// 	 *
// 	 * @param children the filter operations to be "and'ed" together
// 	 * @returns A function evaluating the "and" (set intersection) of the results of the given filter operations.
// 	 */
// 	public and = (children: FilterOperation[]): FilterOperation => ({
// 		name: FilterName.And,
// 		apply: (): Section[] => {
// 			const resultSet = new Set<Section>();
// 			const childResults = children.map((child) => child.apply());
// 			for (let i = 0; i < childResults.length; ++i) {
// 				if (i === 0) {
// 					childResults[i].forEach((section) => resultSet.add(section));
// 				} else {
// 					childResults[i].forEach((section) => {
// 						if (!resultSet.has(section)) {
// 							resultSet["delete"](section);
// 						}
// 					});
// 				}
// 			}
// 			return Array.from(resultSet);
// 		},
// 	});

// 	/**
// 	 *
// 	 * @param compare the comparator
// 	 * @param limit the limit to compare against (rhs of comparator)
// 	 * @param mkey the mkey (numeric key) to test against
// 	 * @returns A function evaluating the sections from the dataset matching the given id with the given comparator.
// 	 */
// 	private mOperation = (
// 		name: FilterName,
// 		compare: MOpComparator,
// 		limit: number,
// 		mkey: InsightFacadeKey
// 	): FilterOperation => ({
// 		name: name,
// 		apply: (): Section[] => {
// 			let ret: Section[] = [];
// 			this.dataset.members.forEach((section) => {
// 				if (compare(section[mkey.field as keyof Section] as number, limit)) {
// 					ret = ret.concat(section);
// 				}
// 			});
// 			return ret;
// 		},
// 	});

// 	public lessThan = (limit: number, mkey: InsightFacadeKey): FilterOperation =>
// 		this.mOperation(FilterName.LessThan, (x, y) => x < y, limit, mkey);
// 	public greaterThan = (limit: number, mkey: InsightFacadeKey): FilterOperation =>
// 		this.mOperation(FilterName.GreaterThan, (x, y) => x > y, limit, mkey);
// 	public equals = (limit: number, mkey: InsightFacadeKey): FilterOperation =>
// 		this.mOperation(FilterName.Equals, (x, y) => x === y, limit, mkey);

// 	public is = (compare: string, skey: InsightFacadeKey): FilterOperation => ({
// 		name: FilterName.Is,
// 		apply: (): Section[] => {
// 			let ret: Section[] = [];
// 			this.dataset.members.forEach((section) => {
// 				if ((section[skey.field as keyof Section] as string) === compare) {
// 					ret = ret.concat(section);
// 				}
// 			});
// 			return ret;
// 		},
// 	});

// 	public not = (child: FilterOperation): FilterOperation => ({
// 		name: FilterName.Not,
// 		apply: (): Section[] => {
// 			const childSet = new Set<Section>();
// 			let result: Section[] = [];
// 			child.apply().forEach((section) => childSet.add(section));
// 			this.dataset.members.forEach((section) => {
// 				if (!childSet.has(section)) {
// 					result = result.concat(section);
// 				}
// 			});
// 			return result;
// 		},
// 	});

// 	/**
// 	 *
// 	 * @returns a function returning everything in the dataset
// 	 */
// 	public all = (): FilterOperation => ({
// 		name: FilterName.All,
// 		apply: (): Section[] => this.dataset.members,
// 	});
// }

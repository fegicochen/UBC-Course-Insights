import { Dataset, DatasetsProvider, DatasetUtils, InsightFacadeKey, OptionsState, Section } from "./Dataset";
import { InsightError } from "./IInsightFacade";

export type FilterOperation = () => Section[];

/**
 * A class to manage filter tree structure in a functional manner.
 * Contains methods or, and, lessThan, etc. which consume a child, children, or parameters
 * and return a function which computes the value with the provided dataset.
 *
 * Ex. `
 * const f = new Filter(dp, options);
 * f.or([f.equals(12, mkey), f.is("abc", skey)]);
 * `
 */
export class Filter {
	private readonly options: OptionsState;
	private dataset: Dataset;

	/**
	 *
	 * @param dp the datasets provider
	 * @param options the options for the given query
	 */
	constructor(dp: DatasetsProvider, options: OptionsState) {
		this.options = options;
		const dataset = DatasetUtils.findDataset(dp, this.options.datasetId);
		if (dataset === undefined) {
			throw new InsightError("Could not find dataset with id: " + options.datasetId + ".");
		}
		this.dataset = dataset;
	}

	/**
	 *
	 * @param children the filter operations to be "or'ed" together
	 * @returns A function evaluating the "or" (set union) of the results of the given filter operations.
	 */
	public or =
		(children: FilterOperation[]): FilterOperation =>
		() => {
			const resultSet = new Set<Section>();
			children
				.map((child) => child())
				.forEach((sectionList) => sectionList.forEach((section) => resultSet.add(section)));
			return Array.from(resultSet);
		};

	/**
	 *
	 * @param children the filter operations to be "and'ed" together
	 * @returns A function evaluating the "and" (set intersection) of the results of the given filter operations.
	 */
	public and =
		(children: FilterOperation[]): FilterOperation =>
		() => {
			const resultSet = new Set<Section>();
			const childResults = children.map((child) => child());
			for (let i = 0; i < childResults.length; ++i) {
				if (i === 0) {
					childResults[i].forEach((section) => resultSet.add(section));
				} else {
					childResults[i].forEach((section) => {
						if (!resultSet.has(section)) {
							resultSet["delete"](section);
						}
					});
				}
			}
			return Array.from(resultSet);
		};

	/**
	 *
	 * @param compare the comparator
	 * @param limit the limit to compare against (rhs of comparator)
	 * @param mkey the mkey (numeric key) to test against
	 * @returns A function evaluating the sections from the dataset matching the given id with the given comparator.
	 */
	private mOperation =
		(compare: (x: number, y: number) => boolean, limit: number, mkey: InsightFacadeKey): FilterOperation =>
		() => {
			let ret: Section[] = [];
			this.dataset.members.forEach((section) => {
				if (compare(section[mkey.field as keyof Section] as number, limit)) {
					ret = ret.concat(section);
				}
			});
			return ret;
		};

	public lessThan = (limit: number, mkey: InsightFacadeKey): FilterOperation =>
		this.mOperation((x, y) => x < y, limit, mkey);
	public greaterThan = (limit: number, mkey: InsightFacadeKey): FilterOperation =>
		this.mOperation((x, y) => x > y, limit, mkey);
	public equals = (limit: number, mkey: InsightFacadeKey): FilterOperation =>
		this.mOperation((x, y) => x === y, limit, mkey);

	public is =
		(compare: string, skey: InsightFacadeKey): FilterOperation =>
		() => {
			let ret: Section[] = [];
			this.dataset.members.forEach((section) => {
				if ((section[skey.field as keyof Section] as string) === compare) {
					ret = ret.concat(section);
				}
			});
			return ret;
		};

	public not =
		(child: FilterOperation): FilterOperation =>
		() => {
			const childSet = new Set<Section>();
			let result: Section[] = [];
			child().forEach((section) => childSet.add(section));
			this.dataset.members.forEach((section) => {
				if (!childSet.has(section)) {
					result = result.concat(section);
				}
			});
			return result;
		};

	/**
	 *
	 * @returns a function returning everything in the dataset
	 */
	public all = (): FilterOperation => () => this.dataset.members;
}

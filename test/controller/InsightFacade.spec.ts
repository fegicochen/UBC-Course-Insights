import { DatasetUtils, Keywords } from "../../src/controller/Dataset";
import {
	IInsightFacade,
	InsightDatasetKind,
	InsightError,
	InsightResult,
	NotFoundError,
	ResultTooLargeError,
} from "../../src/controller/IInsightFacade";
import InsightFacade from "../../src/controller/InsightFacade";
import { clearDisk, getContentFromArchives, loadTestQuery } from "../TestUtil";
import { expect, use } from "chai";
import chaiAsPromised from "chai-as-promised";
import { QueryEngine } from "../../src/controller/QueryEngine";
import { RoomsDatasetProcessor } from "../../src/controller/RoomsDatasetProcessor";
// import * as fs from "fs";

use(chaiAsPromised);

export interface ITestQuery {
	title?: string;
	input: unknown;
	errorExpected: boolean;
	expected: any;
}

describe("InsightFacade", function () {
	let facade: IInsightFacade;

	// Declare datasets used in tests. You should add more datasets like this!
	let sections: string;
	let zeroSectionCourse: string;
	let oneCourse: string;
	let fourCourses: string;
	let twoCourses: string;
	let emptyCourses: string;
	let oneValidOneInvalidCourse: string;
	let oneSectionNoYear: string;
	let noYearManySections: string;
	let improperStructureCourses: string;
	let coursesInWrongFolder: string;
	let allRooms: string;

	const roomsInAllRooms = 364;
	const sectionsInOne = 20;
	const sectionsInTwo = 99;
	const sectionsInFour = 242;

	before(async function () {
		// This block runs once and loads the datasets.
		sections = await getContentFromArchives("pair.zip");
		zeroSectionCourse = await getContentFromArchives("zeroSectionCourse.zip");
		oneCourse = await getContentFromArchives("one.zip");
		fourCourses = await getContentFromArchives("four.zip");
		twoCourses = await getContentFromArchives("two.zip");
		emptyCourses = await getContentFromArchives("empty.zip");
		oneValidOneInvalidCourse = await getContentFromArchives("invalidJSON.zip");
		oneSectionNoYear = await getContentFromArchives("noYearOneSection.zip");
		noYearManySections = await getContentFromArchives("noYearManySections.zip");
		improperStructureCourses = await getContentFromArchives("improperStructure.zip");
		coursesInWrongFolder = await getContentFromArchives("courseWrongFolder.zip");
		allRooms = await getContentFromArchives("campus.zip");

		// Just in case there is anything hanging around from a previous run of the test suite
		await clearDisk();
	});

	describe("AddDataset", function () {
		beforeEach(function () {
			// This section resets the insightFacade instance
			// This runs before each test
			facade = new InsightFacade();
		});

		afterEach(async function () {
			// This section resets the data directory (removing any cached data)
			// This runs after each test, which should make each test independent of the previous one
			await clearDisk();
		});

		it("should reject with an empty dataset id", async function () {
			try {
				await facade.addDataset("", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown above.");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with whitespace dataset id", async function () {
			try {
				await facade.addDataset("   ", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown above.");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it('should reject id with just "_"', async () => {
			try {
				await facade.addDataset("_", sections, InsightDatasetKind.Sections);
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
				return;
			}
			expect.fail("Should have thrown above.");
		});

		it("should accept one character as idstring", async () => {
			const result = await facade.addDataset("a", fourCourses, InsightDatasetKind.Sections);
			expect(result).to.be.length(1);
			expect(result[0]).to.equal("a");
		});

		it("should reject an id with an underscore in the middle", async () => {
			try {
				await facade.addDataset("abc_def", sections, InsightDatasetKind.Sections);
				expect.fail("Should have thrown.");
			} catch (err) {
				expect(err).to.be.instanceOf(InsightError);
			}
		});

		it("should return id of single active dataset", async () => {
			try {
				const ids = await facade.addDataset("abcd", twoCourses, InsightDatasetKind.Sections);
				expect(ids).to.be.length(1);
				expect(ids).to.contain("abcd");
			} catch (_err) {
				expect.fail("Should not have thrown.");
			}
		});

		it("should reject repeat ids", async () => {
			try {
				const res = await facade.addDataset("pqrs", fourCourses, InsightDatasetKind.Sections);
				expect(res).to.be.length(1);
				expect(res).to.contain("pqrs");
			} catch (_err) {
				expect.fail("Shouldn't have thrown.");
			}
			try {
				await facade.addDataset("pqrs", twoCourses, InsightDatasetKind.Sections);
				expect.fail("Should have thrown on first add.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
				const list = await facade.listDatasets();
				expect(list).to.be.length(1);
				expect(list.map((x) => x.id)).to.contain("pqrs");
			}
		});

		it("should accept different ids", async () => {
			try {
				await facade.addDataset("pqrs", fourCourses, InsightDatasetKind.Sections);
			} catch (_e) {
				expect.fail("Should not have thrown on first add.");
			}
			try {
				const result = await facade.addDataset("abcd", twoCourses, InsightDatasetKind.Sections);
				const expLen = 2;
				expect(result).to.be.length(expLen);
				expect(result).to.contain("pqrs");
				expect(result).to.contain("abcd");
			} catch (_e) {
				expect.fail("Should not have thrown on second add.");
			}
		});

		it("should not add no section datasets", async () => {
			try {
				await facade.addDataset("empty", zeroSectionCourse, InsightDatasetKind.Sections);
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
				const list = await facade.listDatasets();
				expect(list).to.be.length(0);
			}
		});

		it("should not add empty datasets", async () => {
			try {
				await facade.addDataset("empty", emptyCourses, InsightDatasetKind.Sections);
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should reject not a base64 string", async () => {
			try {
				await facade.addDataset("invalid", "8)(U(23njnJDNSJDNAIO900129312???dsld", InsightDatasetKind.Sections);
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
				const list = await facade.listDatasets();
				expect(list).to.be.length(0);
			}
		});

		it("should reject a meaningless base64 string", async () => {
			try {
				await facade.addDataset("invalid", "aAaAaAaAaAAaaaaaaAAAA", InsightDatasetKind.Sections);
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should reject an empty string of data", async () => {
			try {
				await facade.addDataset("invalid", "", InsightDatasetKind.Sections);
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should accept with one corrupt file and one ok one", async () => {
			try {
				const result = await facade.addDataset("valid", oneValidOneInvalidCourse, InsightDatasetKind.Sections);
				expect(result).to.contain("valid");
			} catch (_e) {
				expect.fail("Shouldn't have thrown.");
			}
		});

		it("should reject one invalid section missing year", async () => {
			try {
				await facade.addDataset("invalid", oneSectionNoYear, InsightDatasetKind.Sections);
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should accept file with only one section missing data", async () => {
			try {
				const result = await facade.addDataset("valid", noYearManySections, InsightDatasetKind.Sections);
				expect(result).contains("valid");
			} catch (_e) {
				expect.fail("Shouldn't have thrown.");
			}
		});

		it("should reject zip file with improper structure", async () => {
			try {
				await facade.addDataset("invalid", improperStructureCourses, InsightDatasetKind.Sections);
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should keep datasets if improper one added", async () => {
			await facade.addDataset("four", fourCourses, InsightDatasetKind.Sections);
			await facade.addDataset("two", twoCourses, InsightDatasetKind.Sections);

			try {
				await facade.addDataset("invalid", improperStructureCourses, InsightDatasetKind.Sections);
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}

			const res = await facade.addDataset("one", oneCourse, InsightDatasetKind.Sections);
			const expLength = 3;
			expect(res).to.be.length(expLength);
			expect(res).to.contain("one");
			expect(res).to.contain("two");
			expect(res).to.contain("four");
		});

		it("shouldn't change data with repeat ids", async () => {
			await facade.addDataset("typescript", oneCourse, InsightDatasetKind.Sections);

			try {
				await facade.addDataset("typescript", twoCourses, InsightDatasetKind.Sections);
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
				const res = await facade.listDatasets();
				expect(res).to.be.length(1);
				expect(res).to.deep.contain({
					id: "typescript",
					kind: InsightDatasetKind.Sections,
					numRows: sectionsInOne,
				});
			}
		});

		it("should reject if courses in wrong folder", async () => {
			try {
				await facade.addDataset("invalid", coursesInWrongFolder, InsightDatasetKind.Sections);
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should properly add a rooms dataset", async () => {
			const res = await facade.addDataset("pqrs", allRooms, InsightDatasetKind.Rooms);
			expect(res).to.be.length(1);
			expect(res[0]).to.equal("pqrs");

			const datasetInfo = await facade.listDatasets();
			expect(datasetInfo).to.be.length(1);
			expect(datasetInfo[0].id).to.equal("pqrs");
			expect(datasetInfo[0].numRows).to.equal(roomsInAllRooms);
		});

		it("should add both rooms and sections datasets together", async () => {
			const res1 = await facade.addDataset("a", allRooms, InsightDatasetKind.Rooms);
			expect(res1).to.be.length(1);
			expect(res1[0]).to.equal("a");
			const nDts = 2;
			const res2 = await facade.addDataset("b", fourCourses, InsightDatasetKind.Sections);
			expect(res2).to.be.length(nDts);
			expect(res2).to.contain("a");
			expect(res2).to.contain("b");

			const info = await facade.listDatasets();
			expect(info).to.be.length(nDts);
			const infoA = info.find((x) => x.id === "a");
			const infoB = info.find((x) => x.id === "b");
			expect(infoA?.kind).to.equal(InsightDatasetKind.Rooms);
			expect(infoA?.numRows).to.equal(roomsInAllRooms);
			expect(infoB?.kind).to.equal(InsightDatasetKind.Sections);
			expect(infoB?.numRows).to.equal(sectionsInFour);
		});
	});

	describe("RemoveDataset", () => {
		beforeEach(() => {
			facade = new InsightFacade();
		});

		afterEach(async function () {
			await clearDisk();
		});

		it("should remove 1 dataset", async () => {
			await facade.addDataset("four", fourCourses, InsightDatasetKind.Sections);

			try {
				const result = await facade.removeDataset("four");
				expect(result).to.equal("four");
				const datasets = await facade.listDatasets();
				const expLength = 0;
				expect(datasets).to.have.length(expLength);
			} catch (_e) {
				expect.fail("Shouldn't have thrown.");
			}
		});

		it("should fail if dataset not found", async () => {
			await facade.addDataset("two", twoCourses, InsightDatasetKind.Sections);

			try {
				await facade.removeDataset("75");
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(NotFoundError);
				expect(await facade.listDatasets()).to.deep.contain({
					id: "two",
					kind: InsightDatasetKind.Sections,
					numRows: sectionsInTwo,
				});
			}
		});

		it("should fail with empty id", async () => {
			await facade.addDataset("one", oneCourse, InsightDatasetKind.Sections);

			try {
				await facade.removeDataset("");
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
				expect(await facade.listDatasets()).to.deep.contain({
					id: "one",
					kind: InsightDatasetKind.Sections,
					numRows: sectionsInOne,
				});
			}
		});

		it("should fail with underscore id", async () => {
			await facade.addDataset("four", fourCourses, InsightDatasetKind.Sections);

			try {
				await facade.removeDataset("ab_c");
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
				expect(await facade.listDatasets()).to.deep.contain({
					id: "four",
					kind: InsightDatasetKind.Sections,
					numRows: sectionsInFour,
				});
			}
		});

		it("should remove but leave others", async () => {
			await facade.addDataset("one", oneCourse, InsightDatasetKind.Sections);
			await facade.addDataset("four", fourCourses, InsightDatasetKind.Sections);

			const result = await facade.removeDataset("one");
			expect(result).equals("one");
			const list = await facade.listDatasets();
			expect(list).deep.contains({
				id: "four",
				kind: InsightDatasetKind.Sections,
				numRows: sectionsInFour,
			});
			expect(list).has.length(1);
		});
	});

	describe("ListDatasets", () => {
		beforeEach(() => {
			facade = new InsightFacade();
		});

		afterEach(async function () {
			await clearDisk();
		});

		it("should provide all IDs", async () => {
			try {
				await facade.addDataset("two", twoCourses, InsightDatasetKind.Sections);
				await facade.addDataset("one", oneCourse, InsightDatasetKind.Sections);

				const datasets = await facade.listDatasets();
				const datasetIds = datasets.map((d) => d.id);
				const expLength = 2;
				expect(datasets).to.be.length(expLength);
				expect(datasetIds).to.contain("two");
				expect(datasetIds).to.contain("one");
			} catch (_e) {
				expect.fail("Should not throw on add.");
			}
		});

		it("should provide all row counts", async () => {
			try {
				await facade.addDataset("one", oneCourse, InsightDatasetKind.Sections);
				await facade.addDataset("four", fourCourses, InsightDatasetKind.Sections);

				const rownums = new Map<string, number>();
				rownums.set("one", sectionsInOne);
				rownums.set("four", sectionsInFour);

				const datasets = await facade.listDatasets();
				const expLength = 2;
				expect(datasets).to.be.length(expLength);
				datasets.forEach((d) => expect(d.numRows).to.be.equal(rownums.get(d.id)));
			} catch (_e) {
				expect.fail("Should not throw on add.");
			}
		});

		it("should provide database kinds", async () => {
			await facade.addDataset("one", oneCourse, InsightDatasetKind.Sections);

			const result = await facade.listDatasets();
			expect(result).has.length(1);
			expect(result).to.deep.contain({
				id: "one",
				kind: InsightDatasetKind.Sections,
				numRows: 20,
			});
		});

		it("should return empty list if none added", async () => {
			const result = await facade.listDatasets();
			expect(result).to.be.length(0);
		});
	});

	describe("PerformQuery", function () {
		/**
		 * Loads the TestQuery specified in the test name and asserts the behaviour of performQuery.
		 *
		 * Note: the 'this' parameter is automatically set by Mocha and contains information about the test.
		 */
		async function checkQuery(this: Mocha.Context): Promise<void> {
			if (!this.test) {
				throw new Error(
					"Invalid call to checkQuery." +
						"Usage: 'checkQuery' must be passed as the second parameter of Mocha's it(..) function." +
						"Do not invoke the function directly."
				);
			}
			// Destructuring assignment to reduce property accesses
			const { input, expected, errorExpected } = await loadTestQuery(this.test.title);
			let result: InsightResult[];
			try {
				result = await facade.performQuery(input);

				// if (result.length !== expected.length) {
				// 	console.log(`Expected length: ${expected.length}, Actual length: ${result.length}`);
				// }
				// Log expected and actual results
				// fs.writeFileSync("expected_result.json", JSON.stringify(expected, null, 2));
				// fs.writeFileSync("actual_result.json", JSON.stringify(result, null, 2));

				expect(result.length).to.equal(expected.length);
				expect(result).deep.equals(expected);
			} catch (err) {
				if (!errorExpected) {
					const printJSON = false;
					const errClassName = err?.constructor.name;
					const errMsg = (err as Error).message;
					const errJSON = printJSON ? JSON.stringify(err) : "";
					expect.fail(`performQuery threw unexpected error: ${errClassName} ${errMsg} ${errJSON}`);
				}
				if (expected === "InsightError") {
					expect(err).is.instanceOf(InsightError, `${err?.constructor.name}: ${JSON.stringify(err)}`);
				} else if (expected === "ResultTooLargeError") {
					expect(err).is.instanceOf(ResultTooLargeError);
				}
				return;
			}
			if (errorExpected) {
				expect.fail(`performQuery resolved when it should have rejected with ${expected}`);
			}
		}

		before(async function () {
			facade = new InsightFacade();

			// Add the datasets to InsightFacade once.
			// Will *fail* if there is a problem reading ANY dataset.
			const loadDatasetPromises: Promise<string[]>[] = [
				facade.addDataset("anything", sections, InsightDatasetKind.Sections),
				facade.addDataset("hi", allRooms, InsightDatasetKind.Rooms),
			];

			try {
				await Promise.all(loadDatasetPromises);
			} catch (err) {
				throw new Error(`In PerformQuery Before hook, dataset(s) failed to be added. \n${err}`);
			}
		});

		after(async function () {
			await clearDisk();
		});

		// // Examples demonstrating how to test performQuery using the JSON Test Queries.
		// // The relative path to the query file must be given in square brackets.
		it("[valid/check_gt.json] SELECT dept, avg WHERE avg > 97", checkQuery);
		it("[valid/no_results.json] No results", checkQuery);
		it("[valid/check_eq.json] Check equal to (EQ)", checkQuery);
		it("[valid/check_lt.json] Check less than (LT)", checkQuery);
		it("[valid/check_and.json] Check and (AND)", checkQuery);
		it("[valid/check_is.json] Check is (IS)", checkQuery);
		it("[valid/check_or.json] Check or (OR)", checkQuery);
		it("[valid/asterisk_working.json] Asterisk behaving properly", checkQuery);
		it("[valid/check_not.json] Check not (NOT)", checkQuery);
		it("[valid/all_params.json] Get all params", checkQuery);
		it("[valid/double_asterisk.json] Double asterisk", checkQuery);
		it("[valid/filter_by_id.json] Filter by section id", checkQuery);
		it("[valid/filter_by_instructor.json] Filter by section instructor", checkQuery);
		it("[valid/filter_by_title.json] Filter by section title", checkQuery);
		it("[valid/filter_by_uuid.json] Filter by section uuid", checkQuery);
		it("[valid/filter_by_pass.json] Filter by section pass", checkQuery);
		it("[valid/filter_by_fail.json] Filter by section fail", checkQuery);
		it("[valid/filter_by_audit.json] Filter by section audit", checkQuery);
		it("[valid/filter_by_year.json] Filter by section year", checkQuery);
		it("[valid/very_complex.json] Very complex query", checkQuery);
		it("[valid/specific_course.json] Select specific course", checkQuery);
		it("[valid/validResult.json] valid complicated results", checkQuery);
		it("[valid/simple.json] SELECT dept, avg WHERE avg > 97", checkQuery);
		it("[valid/validEverything.json] valid everything", checkQuery);
		// Tests for apply and sort in C2
		it("[valid/applyCase1.json] calculate the average of sections avg grouped by dept", checkQuery);
		it("[valid/applyCase2.json] calculate the average of sections avg grouped by dept", checkQuery);
		it("[valid/applyCase3.json] calculate the average of sections avg grouped by dept", checkQuery);
		it("[valid/sort_case.json] Retrieve High-Average Courses with Department and Course Number", checkQuery);
		it("[valid/sortcase2.json] Retrieve High-Average Courses with Department and Course Number", checkQuery);
		it("[valid/sortcase3.json] Retrieve High-Average Courses with Department and Course Number", checkQuery);
		it("[valid/sortcase4.json] Retrieve High-Average Courses with Department and Course Number", checkQuery);
		it("[valid/sortcase5.json] Retrieve High-Average Courses with Department and Course Number", checkQuery);
		it("[valid/sortcase6.json] Retrieve High-Average Courses with Department and Course Number", checkQuery);
		it("[valid/sortcase9.json] Retrieve High-Average Courses with Department and Course Number", checkQuery);
		it("[valid/sortcase11.json] Retrieve High-Average Courses with Department and Course Number", checkQuery);

		it("[invalid/missing_where.json] Query missing WHERE", checkQuery);
		it("[invalid/missing_options.json] Query missing OPTIONS", checkQuery);
		it("[invalid/missing_columns.json] Query missing COLUMNS", checkQuery);
		it("[invalid/string_input.json] Query is a string not an object", checkQuery);
		it("[invalid/number_input.json] Query is a number not an object", checkQuery);
		it("[invalid/columns_empty.json] COLUMNS is empty", checkQuery);
		it("[invalid/improper_json_options.json] Improper JSON in OPTIONS", checkQuery);
		it("[invalid/too_big.json] Too many results", checkQuery);
		it("[invalid/gt_not_numeric.json] GT given string arg", checkQuery);
		it("[invalid/lt_not_numeric.json] LT given string arg", checkQuery);
		it("[invalid/asterisk_in_middle.json] Asterisk can't be in middle", checkQuery);
		it("[invalid/only_asterisk.json] Too much", checkQuery);
		it("[invalid/multiple_datasets.json] Multiple datasets fail", checkQuery);
		it("[invalid/not_added.json] Accessing dataset not added", checkQuery);
		it("[invalid/order_not_in_columns.json] Order is not in columns", checkQuery);
		it("[invalid/num_for_dept.json] Number to filter for dept", checkQuery);
		it("[invalid/or_empty_array.json] OR as empty array", checkQuery);
		it("[invalid/and_empty_array.json] AND as empty array", checkQuery);
		it("[invalid/eq_passed_string.json] EQ passed string", checkQuery);
		it("[invalid/gt_passed_string.json] GT passed string", checkQuery);
		it("[invalid/lt_passed_string.json] LT passed string", checkQuery);
		it("[invalid/is_passed_number.json] IS passed number", checkQuery);
		it("[invalid/empty_object.json] Empty object passed", checkQuery);
		it("[invalid/invalid.json] Query missing WHERE", checkQuery);
		it("[invalid/invalidString.json] Section avg changed to string", checkQuery);
		it("[invalid/resultTooBig.json] result too big should send error", checkQuery);
		it("[invalid/invalidKey.json] invalid key in IS", checkQuery);
		it("[invalid/invalidFilter.json] invalid filter key: RANDOM", checkQuery);
		it("[invalid/invalidOrderKey.json] ORDER key must be in COLUMNS", checkQuery);
		it("[invalid/invalidValueType.json] Invalid value type in EQ, should be number", checkQuery);
		it(
			"[invalid/invalidAsterisks.json]  Asterisks (*) can only be the first or last characters of input strings",
			checkQuery
		);
		it("[invalid/invalidNoKeys.json]  GT should only have 1 key, has 0", checkQuery);
		it("[invalid/invalidNot.json]  NOT must be object", checkQuery);
		it("[invalid/invalidOr.json]  OR must be a non-empty array", checkQuery);
		it("[invalid/invalidWhere.json]  WHERE should only have 1 key, has 2", checkQuery);
		it("[invalid/invalidEQ.json]  EQ should only have 1 key, has 2", checkQuery);
		it("[invalid/invalidGT.json]  GT should only have 1 key, has 2", checkQuery);
		it("[invalid/invalidLT.json]  LT should only have 1 key, has 2", checkQuery);
		it("[invalid/invalidIS.json] Invalid value type in IS, should be string", checkQuery);
		it("[invalid/missingColumns.json] Invalid key type in LT, should be string", checkQuery);
		it("[invalid/invalidColumns.json] Invalid key sections_it in COLUMNS", checkQuery);
		it("[invalid/invalidAnd.json] AND must be a non-empty array", checkQuery);
		it("[invalid/invalidEverything.json] Breaking everything", checkQuery);
		it("[invalid/EQ.json] Invalid key sectiear in EQ", checkQuery);
		it("[invalid/LT.json] Invalid key sectiear in LT", checkQuery);
		it("[invalid/GT.json] Invalid key sectiear in GT", checkQuery);
		it("[invalid/numberEQ.json] Invalid value type in EQ, should be number", checkQuery);
		it("[invalid/numberGT.json] Invalid key sectiear in GT", checkQuery);
		it("[invalid/numberLT.json] Invalid key sectiear in LT", checkQuery);
	});
});

describe("DatasetUtils", () => {
	describe("isValidIDString", () => {
		it("should reject empty string", () => {
			expect(DatasetUtils.isValidIdString("")).equals(false);
			expect(DatasetUtils.isValidIdString("  ")).equals(false);
		});

		it("should reject underscores", () => {
			expect(DatasetUtils.isValidIdString("_")).equals(false);
			expect(DatasetUtils.isValidIdString(" _ ")).equals(false);
			expect(DatasetUtils.isValidIdString("ab_cd")).equals(false);
			expect(DatasetUtils.isValidIdString("PQRS_")).equals(false);
			expect(DatasetUtils.isValidIdString("_ADSD")).equals(false);
		});

		it("should accept proper strings", () => {
			expect(DatasetUtils.isValidIdString("ABC")).equals(true);
			expect(DatasetUtils.isValidIdString("JDKSD2391i")).equals(true);
		});
	});

	describe("parseSKey", () => {
		it("should reject invalid ids in skeys", () => {
			expect(DatasetUtils.parseSKey("abc_def_avg")).equals(undefined);
			expect(DatasetUtils.parseSKey("_year")).equals(undefined);
			expect(DatasetUtils.parseSKey("A__B_AD_DAS")).equals(undefined);
		});

		// it("should accept skeys", () => {
		// 	expect(DatasetUtils.parseSKey("abc_dept")).to.deep.equal({
		// 		idstring: "abc",
		// 		field: DatasetId.Dept,
		// 	});
		// 	expect(DatasetUtils.parseSKey("123_instructor")).to.deep.equal({
		// 		idstring: "123",
		// 		field: DatasetId.Instructor,
		// 	});
		// });

		it("should reject mkeys", () => {
			expect(DatasetUtils.parseSKey("abc_avg")).equals(undefined);
			expect(DatasetUtils.parseSKey("123_fail")).equals(undefined);
		});

		it("should reject nonsense", () => {
			expect(DatasetUtils.parseSKey("DNSKLDNASNDi123j13081232903_ie-12i321non")).equals(undefined);
			expect(DatasetUtils.parseSKey("DKlandan(*09213_@03_+@)__#@i23jo1n")).equals(undefined);
		});
	});

	describe("parseMKey", () => {
		it("should reject invalid ids in mkeys", () => {
			expect(DatasetUtils.parseMKey("abc_def_avg")).equals(undefined);
			expect(DatasetUtils.parseMKey("_year")).equals(undefined);
			expect(DatasetUtils.parseMKey("A__B_AD_DAS")).equals(undefined);
		});

		it("should reject skeys", () => {
			expect(DatasetUtils.parseMKey("abc_dept")).equals(undefined);
			expect(DatasetUtils.parseMKey("123_instructor")).equals(undefined);
		});

		// it("should accept proper mkeys", () => {
		// 	expect(DatasetUtils.parseMKey("abc_avg")).to.deep.equal({
		// 		idstring: "abc",
		// 		field: DatasetId.Avg,
		// 	});
		// 	expect(DatasetUtils.parseMKey("123_fail")).to.deep.equal({
		// 		idstring: "123",
		// 		field: DatasetId.Fail,
		// 	});
		// });

		it("should reject nonsense", () => {
			expect(DatasetUtils.parseMKey("DNSKLDNASNDi123j13081232903_ie-12i321non")).equals(undefined);
			expect(DatasetUtils.parseMKey("DKlandan(*09213_@03_+@)__#@i23jo1n")).equals(undefined);
		});
	});
});

describe("DatasetUtils", () => {
	let qe: QueryEngine;

	before(() => {
		qe = new QueryEngine(() => ({ sections: [], rooms: [] }));
	});

	describe("requireExactKeys", () => {
		it("should throw if there are extra keys", () => {
			try {
				DatasetUtils.requireExactKeys({ B: 12, C: 3 }, [["A", true]]);
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should throw if there are missing keys", () => {
			try {
				DatasetUtils.requireExactKeys({ B: 4, A: "d" }, [
					["A", true],
					["B", true],
					["C", true],
				]);
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should return proper values start of array", () => {
			const result = DatasetUtils.requireExactKeys({ AND: { A: "1" } }, [
				[Keywords.Filter.Logic.And, false],
				[Keywords.Filter.Logic.Or, false],
				[Keywords.Filter.MComparator.Equal, false],
				[Keywords.Filter.MComparator.GreaterThan, false],
				[Keywords.Filter.MComparator.LessThan, false],
				[Keywords.Filter.Negation.Not, false],
				[Keywords.Filter.SComparator.Is, false],
			]);
			expect(result.has("AND")).to.equal(true);
			expect(result.has(Keywords.Filter.Logic.Or)).to.equal(false);
			expect(result.get("AND")).to.deep.equal({ A: "1" });
			expect(result.size).to.equal(1);
		});

		it("should return proper values later in array", () => {
			const result = DatasetUtils.requireExactKeys({ LT: { A: "1" } }, [
				[Keywords.Filter.Logic.And, false],
				[Keywords.Filter.Logic.Or, false],
				[Keywords.Filter.MComparator.Equal, false],
				[Keywords.Filter.MComparator.GreaterThan, false],
				[Keywords.Filter.MComparator.LessThan, false],
				[Keywords.Filter.Negation.Not, false],
				[Keywords.Filter.SComparator.Is, false],
			]);
			expect(result.size).to.equal(1);
			expect(result.has("LT")).to.equal(true);
			expect(result.has(Keywords.Filter.Logic.Or)).to.equal(false);
			expect(result.get("LT")).to.deep.equal({ A: "1" });
		});

		it("should not throw if missing keys are optional", () => {
			let ret;
			try {
				ret = DatasetUtils.requireExactKeys({ A: "A" }, [
					["A", true],
					["B", false],
				]);
			} catch (e) {
				expect.fail("Shouldn't have thrown: " + e);
			}
			expect(ret.get("A")).to.equal("A");
			expect(ret.get("B")).equals(undefined);
		});

		it("should return key values if present", () => {
			const pVal = 22;
			const ret = DatasetUtils.requireExactKeys({ P: pVal, Q: "ABC" }, [
				["P", false],
				["Q", true],
			]);
			expect(ret.get("P")).to.equal(pVal);
			expect(ret.get("Q")).to.equal("ABC");
		});
	});

	describe("requireHasKeys", () => {
		it("should fail if a required key is missing", () => {
			try {
				DatasetUtils.requireHasKeys({ a: "bc", d: "ef" }, [
					["a", true],
					["q", true],
				]);
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).is.instanceOf(InsightError);
			}
		});

		it("should pass if not required key missing", () => {
			const result = DatasetUtils.requireHasKeys({ a: "bc", d: "ef" }, [
				["a", true],
				["q", false],
			]);
			expect(result.get("a")).to.equal("bc");
			expect(result.has("q")).to.equal(false);
			expect(result.has("d")).to.equal(false);
		});

		it("should pass if match is exact", () => {
			const result = DatasetUtils.requireHasKeys({ a: "bc", d: "ef" }, [
				["a", true],
				["d", true],
			]);
			expect(result.get("a")).to.equal("bc");
			expect(result.get("d")).to.equal("ef");
		});
	});

	describe("checkIsObject", () => {
		it("should reject a string input", async () => {
			try {
				DatasetUtils.checkIsObject("PQRS", "abcd");
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
				expect((e as InsightError).message).to.contain("PQRS");
			}
		});

		it("should reject array input", async () => {
			try {
				DatasetUtils.checkIsObject("", []);
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should accept an onject input", async () => {
			try {
				DatasetUtils.checkIsObject("", { abc: "def" });
			} catch (e) {
				expect.fail("Should not have thrown: " + e);
			}
		});
	});

	describe("checkIsArray", () => {
		it("should reject a number input", async () => {
			try {
				const num = 12;
				DatasetUtils.checkIsArray("ABC", num);
				expect.fail("Should have thrown");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
				expect((e as InsightError).message).to.contain("ABC");
			}
		});

		it("should accept empty array input", async () => {
			try {
				DatasetUtils.checkIsArray("", []);
			} catch (e) {
				expect.fail("Should not have thrown: " + e);
			}
		});
	});

	describe("processQuery", () => {
		it("should reject non-json", async () => {
			try {
				await qe.processQuery("ABC");
				expect.fail("Should have thrown.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should reject with invalid key", async () => {
			try {
				await qe.processQuery({ PLUS: "ABCD" });
				expect.fail("Should have failed");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should reject query without options or where", async () => {
			try {
				await qe.processQuery({});
				expect.fail("Should have failed.");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});

		it("should reject empty options", async () => {
			try {
				await qe.processQuery({ OPTIONS: {} });
				expect.fail("Should have failed");
			} catch (e) {
				expect(e).to.be.instanceOf(InsightError);
			}
		});
	});

	describe("getGeoLocation", () => {
		afterEach(async function () {
			await clearDisk();
		});

		it("check valid GeoLocation", async () => {
			try {
				const response = await RoomsDatasetProcessor.getGeoLocation("6245 Agronomy Road V6T 1Z4");
				expect(response).to.deep.equal({ lat: 49.26125, lon: -123.24807 });
			} catch (_e) {
				expect.fail("Should not throw error.");
			}
		});
	});
});

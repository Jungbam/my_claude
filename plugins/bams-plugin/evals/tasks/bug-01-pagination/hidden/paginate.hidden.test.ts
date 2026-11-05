import { expect, test } from "bun:test";
import { paginate } from "../src/paginate";
import { pageLabel, rangeLabel } from "../src/label";

const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test("25 items / 10 per page has 3 pages", () => {
  expect(paginate(nums(25), 1, 10).totalPages).toBe(3);
});
test("regress: partial last page contents", () => {
  expect(paginate(nums(25), 3, 10).items).toEqual([21, 22, 23, 24, 25]);
});
test("page 2 of 25 items has next", () => {
  const p = paginate(nums(25), 2, 10);
  expect(p.hasNext).toBe(true);
  expect(p.hasPrev).toBe(true);
});
test("regress: last partial page has no next", () => {
  expect(paginate(nums(25), 3, 10).hasNext).toBe(false);
});
test("one extra item creates a new page", () => {
  const p = paginate(nums(11), 2, 10);
  expect(p.totalPages).toBe(2);
  expect(p.items).toEqual([11]);
});
test("label reflects the partial last page", () => {
  expect(pageLabel(paginate(nums(25), 3, 10))).toBe("Page 3 of 3");
});
test("regress: range label on last page", () => {
  expect(rangeLabel(paginate(nums(25), 3, 10), 25)).toBe("21-25 of 25");
});
test("fewer items than page size is one page", () => {
  const p = paginate(nums(3), 1, 10);
  expect(p.totalPages).toBe(1);
  expect(p.hasNext).toBe(false);
});
test("regress: exact multiple still correct", () => {
  const p = paginate(nums(20), 2, 10);
  expect(p.totalPages).toBe(2);
  expect(p.hasNext).toBe(false);
});

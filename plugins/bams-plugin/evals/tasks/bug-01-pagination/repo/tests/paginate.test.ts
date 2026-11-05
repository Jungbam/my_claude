import { expect, test } from "bun:test";
import { paginate } from "../src/paginate";
import { pageLabel } from "../src/label";

const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test("first page of an exact multiple", () => {
  const p = paginate(nums(20), 1, 10);
  expect(p.items).toEqual(nums(10));
  expect(p.totalPages).toBe(2);
  expect(p.hasPrev).toBe(false);
  expect(p.hasNext).toBe(true);
});

test("label for exact multiple", () => {
  expect(pageLabel(paginate(nums(20), 2, 10))).toBe("Page 2 of 2");
});

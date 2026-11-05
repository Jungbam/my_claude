import { expect, test } from "bun:test";
import { selectVisible, counts } from "../src/selectors";

const T = (id: string, title: string, done: boolean, priority: 1 | 2 | 3, createdAt: number) => ({ id, title, done, priority, createdAt });
const todos = [
  T("a", "Buy milk", false, 1, 100),
  T("b", "Write report", true, 3, 200),
  T("c", "Buy flowers", false, 3, 300),
  T("d", "Call mom", false, 2, 300),
  T("e", "Pay rent", true, 2, 50),
];
const S = (status: any, search: string, sort: any) => ({ todos, filter: { status, search, sort } });
const ids = (s: any) => selectVisible(s).map((t) => t.id);

test("sort created: newest first, ties by id asc", () => {
  expect(ids(S("all", "", "created"))).toEqual(["c", "d", "b", "a", "e"]);
});
test("sort priority: high first, then newest, then id", () => {
  expect(ids(S("all", "", "priority"))).toEqual(["c", "b", "d", "e", "a"]);
});
test("search is case-insensitive substring", () => {
  expect(ids(S("all", "BUY", "created"))).toEqual(["c", "a"]);
});
test("search is trimmed; blank search matches all", () => {
  expect(ids(S("all", "  buy ", "created"))).toEqual(["c", "a"]);
  expect(ids(S("all", "   ", "created")).length).toBe(5);
});
test("search combined with status", () => {
  expect(ids(S("active", "buy", "priority"))).toEqual(["c", "a"]);
  expect(ids(S("done", "buy", "priority"))).toEqual([]);
});
test("status + sort without search", () => {
  expect(ids(S("done", "", "priority"))).toEqual(["b", "e"]);
});
test("no match -> empty", () => {
  expect(ids(S("all", "zzz", "created"))).toEqual([]);
});
test("does not mutate state.todos order", () => {
  selectVisible(S("all", "", "priority"));
  expect(todos.map((t) => t.id)).toEqual(["a", "b", "c", "d", "e"]);
});
test("counts ignore status but respect search", () => {
  expect(counts(S("done", "", "created"))).toEqual({ all: 5, active: 3, done: 2 });
  expect(counts(S("done", "buy", "created"))).toEqual({ all: 2, active: 2, done: 0 });
});
test("counts search is case-insensitive and trimmed", () => {
  expect(counts(S("all", " REPORT ", "created"))).toEqual({ all: 1, active: 0, done: 1 });
});

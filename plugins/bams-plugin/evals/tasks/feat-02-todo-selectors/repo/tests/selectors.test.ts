import { expect, test } from "bun:test";
import { selectVisible } from "../src/selectors";
import { setStatus, initialState } from "../src/state";

const todos = [
  { id: "a", title: "Buy milk", done: false, priority: 1 as const, createdAt: 1 },
  { id: "b", title: "Write report", done: true, priority: 3 as const, createdAt: 2 },
];

test("status filter", () => {
  const s = setStatus({ ...initialState, todos }, "done");
  expect(selectVisible(s).map((t) => t.id)).toEqual(["b"]);
});

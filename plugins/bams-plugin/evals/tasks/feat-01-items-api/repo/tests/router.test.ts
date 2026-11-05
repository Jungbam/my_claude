import { expect, test } from "bun:test";
import { handle } from "../src/router";
import { createStore } from "../src/store";

test("health", () => {
  expect(handle({ method: "GET", path: "/health" }, createStore())).toEqual({ status: 200, body: { ok: true } });
});

test("list items", () => {
  const store = createStore([{ id: "1", name: "pen", price: 3 }]);
  expect(handle({ method: "GET", path: "/items" }, store).body).toEqual([{ id: "1", name: "pen", price: 3 }]);
});

test("unknown path", () => {
  expect(handle({ method: "GET", path: "/nope" }, createStore()).status).toBe(404);
});

import { expect, test } from "bun:test";
import { handle } from "../src/router";
import { createStore } from "../src/store";

const post = (body: unknown) => ({ method: "POST", path: "/items", body });

test("create returns 201 with item", () => {
  const store = createStore();
  const r = handle(post({ name: "pen", price: 3.5 }), store);
  expect(r.status).toBe(201);
  expect(r.body).toEqual({ id: "1", name: "pen", price: 3.5 });
});
test("created item is persisted and listed", () => {
  const store = createStore();
  handle(post({ name: "pen", price: 1 }), store);
  expect(handle({ method: "GET", path: "/items" }, store).body).toEqual([{ id: "1", name: "pen", price: 1 }]);
});
test("name is trimmed", () => {
  const r = handle(post({ name: "  pen  ", price: 0 }), createStore());
  expect(r.status).toBe(201);
  expect((r.body as any).name).toBe("pen");
});
test("price 0 is valid", () => {
  expect(handle(post({ name: "free", price: 0 }), createStore()).status).toBe(201);
});
test("missing body -> 400 both fields", () => {
  const r = handle({ method: "POST", path: "/items" }, createStore());
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ error: "validation", fields: ["name", "price"] });
});
test("blank name -> 400 name", () => {
  const r = handle(post({ name: "   ", price: 1 }), createStore());
  expect(r.status).toBe(400);
  expect(r.body).toEqual({ error: "validation", fields: ["name"] });
});
test("name longer than 50 -> 400", () => {
  const r = handle(post({ name: "x".repeat(51), price: 1 }), createStore());
  expect(r.status).toBe(400);
  expect((r.body as any).fields).toEqual(["name"]);
});
test("name of exactly 50 is ok", () => {
  expect(handle(post({ name: "x".repeat(50), price: 1 }), createStore()).status).toBe(201);
});
test("negative or non-number price -> 400 price", () => {
  for (const price of [-1, "3", null, NaN]) {
    const r = handle(post({ name: "a", price }), createStore());
    expect(r.status).toBe(400);
    expect((r.body as any).fields).toEqual(["price"]);
  }
});
test("duplicate name (case-insensitive) -> 409", () => {
  const store = createStore();
  handle(post({ name: "Pen", price: 1 }), store);
  const r = handle(post({ name: "pEN ", price: 2 }), store);
  expect(r.status).toBe(409);
  expect(r.body).toEqual({ error: "duplicate" });
  expect(store.list().length).toBe(1);
});
test("get by id", () => {
  const store = createStore([{ id: "1", name: "pen", price: 3 }]);
  expect(handle({ method: "GET", path: "/items/1" }, store)).toEqual({ status: 200, body: { id: "1", name: "pen", price: 3 } });
});
test("get missing id -> 404", () => {
  const r = handle({ method: "GET", path: "/items/99" }, createStore());
  expect(r).toEqual({ status: 404, body: { error: "not_found" } });
});
test("known path with wrong method -> 405", () => {
  expect(handle({ method: "DELETE", path: "/items" }, createStore()).status).toBe(405);
  expect(handle({ method: "PUT", path: "/items/1" }, createStore()).status).toBe(405);
  expect(handle({ method: "POST", path: "/health" }, createStore()).status).toBe(405);
});
test("regress: unknown path stays 404", () => {
  expect(handle({ method: "GET", path: "/nope" }, createStore()).status).toBe(404);
});

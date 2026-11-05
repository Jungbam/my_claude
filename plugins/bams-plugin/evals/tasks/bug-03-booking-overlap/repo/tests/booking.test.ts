import { expect, test } from "bun:test";
import { overlaps } from "../src/interval";
import { canBook } from "../src/booking";

const iv = (s: string, e: string) => ({ start: s, end: e });

test("partial overlap", () => {
  expect(overlaps(iv("2025-03-01T10:00:00Z", "2025-03-01T11:00:00Z"), iv("2025-03-01T10:30:00Z", "2025-03-01T11:30:00Z"))).toBe(true);
});

test("disjoint", () => {
  expect(overlaps(iv("2025-03-01T10:00:00Z", "2025-03-01T11:00:00Z"), iv("2025-03-01T12:00:00Z", "2025-03-01T13:00:00Z"))).toBe(false);
});

test("other room is free", () => {
  const ex = [{ id: "1", room: "A", ...iv("2025-03-01T10:00:00Z", "2025-03-01T11:00:00Z") }];
  expect(canBook(ex, "B", iv("2025-03-01T10:00:00Z", "2025-03-01T11:00:00Z"))).toBe(true);
});

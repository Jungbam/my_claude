import { expect, test } from "bun:test";
import { overlaps } from "../src/interval";
import { canBook, findConflicts } from "../src/booking";

const iv = (s: string, e: string) => ({ start: s, end: e });
const A = iv("2025-03-01T10:00:00Z", "2025-03-01T11:00:00Z");

test("back-to-back (end == start) is not an overlap", () => {
  expect(overlaps(A, iv("2025-03-01T11:00:00Z", "2025-03-01T12:00:00Z"))).toBe(false);
});
test("back-to-back in the other direction", () => {
  expect(overlaps(iv("2025-03-01T09:00:00Z", "2025-03-01T10:00:00Z"), A)).toBe(false);
});
test("candidate fully contains existing", () => {
  expect(overlaps(A, iv("2025-03-01T09:00:00Z", "2025-03-01T12:00:00Z"))).toBe(true);
});
test("regress: existing fully contains candidate", () => {
  expect(overlaps(A, iv("2025-03-01T10:15:00Z", "2025-03-01T10:45:00Z"))).toBe(true);
});
test("regress: identical ranges overlap", () => {
  expect(overlaps(A, { ...A })).toBe(true);
});
test("different UTC offsets, same instant range (Seoul 19:00+09 == 10:00Z)", () => {
  expect(overlaps(A, iv("2025-03-01T19:30:00+09:00", "2025-03-01T20:30:00+09:00"))).toBe(true);
});
test("regress: different UTC offsets, back-to-back across zones", () => {
  // 20:00+09:00 == 11:00Z, touches A's end
  expect(overlaps(A, iv("2025-03-01T20:00:00+09:00", "2025-03-01T21:00:00+09:00"))).toBe(false);
});
test("string order differs from time order across offsets (05:30-05:00 == 10:30Z overlaps)", () => {
  expect(overlaps(A, iv("2025-03-01T05:30:00-05:00", "2025-03-01T06:30:00-05:00"))).toBe(true);
});
test("canBook allows back-to-back, rejects containment", () => {
  const ex = [{ id: "1", room: "A", ...A }];
  expect(canBook(ex, "A", iv("2025-03-01T11:00:00Z", "2025-03-01T12:00:00Z"))).toBe(true);
  expect(canBook(ex, "A", iv("2025-03-01T09:00:00Z", "2025-03-01T12:00:00Z"))).toBe(false);
});
test("cancelled bookings never conflict; conflicts are listed", () => {
  const ex = [
    { id: "1", room: "A", status: "cancelled" as const, ...A },
    { id: "2", room: "A", ...iv("2025-03-01T10:30:00Z", "2025-03-01T10:45:00Z") },
  ];
  const c = findConflicts(ex, "A", iv("2025-03-01T10:00:00Z", "2025-03-01T11:00:00Z"));
  expect(c.map((b) => b.id)).toEqual(["2"]);
});

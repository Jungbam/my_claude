import { expect, test } from "bun:test";
import { cartTotals } from "../src/cart";

const L = (c: number, q = 1) => ({ sku: "x", unitPriceCents: c, quantity: q });

test("discount is computed once on the subtotal (3x333 @10%)", () => {
  const t = cartTotals([L(333), L(333), L(333)], 10);
  expect(t.subtotalCents).toBe(999);
  expect(t.discountCents).toBe(100);
  expect(t.totalCents).toBe(899);
});
test("half rounds up (150 @5% => 7.5 => 8)", () => {
  expect(cartTotals([L(150)], 5).discountCents).toBe(8);
});
test("regress: fractional percent (1001 @12.5% => 125.125 => 125)", () => {
  expect(cartTotals([L(1001)], 12.5).discountCents).toBe(125);
});
test("regress: below half rounds down (1001 @12.4% => 124.1 => 124)", () => {
  expect(cartTotals([L(1001)], 12.4).discountCents).toBe(124);
});
test("many small lines do not accumulate rounding error", () => {
  const lines = Array.from({ length: 7 }, () => L(99));
  const t = cartTotals(lines, 15); // 693 * 0.15 = 103.95 => 104
  expect(t.discountCents).toBe(104);
  expect(t.totalCents).toBe(589);
});
test("regress: quantity is respected", () => {
  const t = cartTotals([L(199, 3)], 20); // 597 * .2 = 119.4 => 119
  expect(t.discountCents).toBe(119);
  expect(t.totalCents).toBe(478);
});
test("float trap (10 cents @15% => 1.5 => 2)", () => {
  expect(cartTotals([L(10)], 15).discountCents).toBe(2);
});
test("regress: 100% discount", () => {
  const t = cartTotals([L(333), L(334)], 100);
  expect(t.totalCents).toBe(0);
});
test("regress: zero discount is exact", () => {
  expect(cartTotals([L(333), L(333), L(333)], 0).totalCents).toBe(999);
});

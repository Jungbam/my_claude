import { expect, test } from "bun:test";
import { cartTotals } from "../src/cart";
import { formatCents } from "../src/money";

test("no discount", () => {
  const t = cartTotals([{ sku: "a", unitPriceCents: 250, quantity: 2 }]);
  expect(t).toEqual({ subtotalCents: 500, discountCents: 0, totalCents: 500 });
});

test("clean 10% discount", () => {
  const t = cartTotals([{ sku: "a", unitPriceCents: 1000, quantity: 1 }], 10);
  expect(t.totalCents).toBe(900);
});

test("formatCents", () => {
  expect(formatCents(5)).toBe("$0.05");
  expect(formatCents(123456)).toBe("$1234.56");
});

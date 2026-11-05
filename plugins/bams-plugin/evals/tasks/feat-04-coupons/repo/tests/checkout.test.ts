import { expect, test } from "bun:test";
import { checkout } from "../src/checkout";

const order = { lines: [{ sku: "a", unitPriceCents: 1500, quantity: 2 }], taxRateBp: 800 };

test("price breakdown without coupon", () => {
  const { pricing } = checkout(order);
  expect(pricing.subtotalCents).toBe(3000);
  expect(pricing.taxCents).toBe(240);
  expect(pricing.shippingCents).toBe(599);
  expect(pricing.totalCents).toBe(3839);
});

test("receipt without coupon", () => {
  expect(checkout(order).receipt).toBe("Subtotal: $30.00\nTax: $2.40\nShipping: $5.99\nTotal: $38.39");
});

test("empty order throws", () => {
  expect(() => checkout({ lines: [], taxRateBp: 800 })).toThrow("empty order");
});

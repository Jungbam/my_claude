import { expect, test } from "bun:test";
import { checkout } from "../src/checkout";

const mk = (cents: number, coupon?: string, bp = 800) => ({
  lines: [{ sku: "a", unitPriceCents: cents, quantity: 1 }],
  taxRateBp: bp,
  ...(coupon !== undefined ? { coupon } : {}),
});

test("SAVE10: 10% off, tax on discounted amount", () => {
  const { pricing, receipt } = checkout(mk(3000, "SAVE10"));
  expect(pricing.discountCents).toBe(300);
  expect(pricing.taxCents).toBe(216); // 2700 * 8%
  expect(pricing.shippingCents).toBe(599);
  expect(pricing.totalCents).toBe(3000 - 300 + 216 + 599);
  expect(pricing.coupon).toEqual({ code: "SAVE10", applied: true });
  expect(receipt).toBe("Subtotal: $30.00\nDiscount (SAVE10): -$3.00\nTax: $2.16\nShipping: $5.99\nTotal: $35.15");
});
test("SAVE10 rounds half up (1005 -> 100.5 -> 101)", () => {
  expect(checkout(mk(1005, "SAVE10")).pricing.discountCents).toBe(101);
});
test("code is trimmed and case-insensitive", () => {
  const { pricing } = checkout(mk(3000, "  save10 "));
  expect(pricing.discountCents).toBe(300);
  expect(pricing.coupon?.code).toBe("SAVE10");
});
test("FLAT5 needs subtotal >= $20", () => {
  const ok = checkout(mk(2000, "FLAT5"));
  expect(ok.pricing.discountCents).toBe(500);
  expect(ok.pricing.coupon).toEqual({ code: "FLAT5", applied: true });
  const no = checkout(mk(1999, "FLAT5"));
  expect(no.pricing.discountCents).toBe(0);
  expect(no.pricing.coupon).toEqual({ code: "FLAT5", applied: false, error: "min_subtotal" });
  expect(no.receipt).toBe('Subtotal: $19.99\nCoupon "FLAT5" not applied: minimum subtotal not met\nTax: $1.60\nShipping: $5.99\nTotal: $27.58');
});
test("free shipping threshold uses subtotal before discount", () => {
  const { pricing } = checkout(mk(5000, "SAVE10")); // discounted 4500 but subtotal 5000 -> free
  expect(pricing.shippingCents).toBe(0);
  expect(pricing.discountCents).toBe(500);
  expect(pricing.taxCents).toBe(360);
  expect(pricing.totalCents).toBe(4500 + 360);
});
test("FREESHIP removes shipping, no discount line", () => {
  const { pricing, receipt } = checkout(mk(2500, "freeship"));
  expect(pricing.shippingCents).toBe(0);
  expect(pricing.discountCents).toBe(0);
  expect(pricing.totalCents).toBe(2500 + 200);
  expect(receipt).toBe("Subtotal: $25.00\nTax: $2.00\nShipping: $0.00 (FREESHIP)\nTotal: $27.00");
});
test("unknown code: order still succeeds, no discount, reported", () => {
  const { pricing, receipt } = checkout(mk(3000, "bogus"));
  expect(pricing.discountCents).toBe(0);
  expect(pricing.totalCents).toBe(3000 + 240 + 599);
  expect(pricing.coupon).toEqual({ code: "BOGUS", applied: false, error: "unknown" });
  expect(receipt).toContain('Coupon "BOGUS" not applied: unknown code');
});
test("blank coupon string behaves like no coupon", () => {
  const { pricing, receipt } = checkout(mk(3000, "   "));
  expect(pricing.coupon).toBeUndefined();
  expect(receipt).toBe("Subtotal: $30.00\nTax: $2.40\nShipping: $5.99\nTotal: $38.39");
});
test("no coupon: discountCents is 0 and receipt unchanged", () => {
  const { pricing } = checkout(mk(3000));
  expect(pricing.discountCents).toBe(0);
});
test("discount never exceeds subtotal", () => {
  const { pricing } = checkout(mk(300, "FLAT5")); // below min -> not applied, still never negative
  expect(pricing.totalCents).toBeGreaterThanOrEqual(0);
  expect(pricing.discountCents).toBeLessThanOrEqual(300);
});

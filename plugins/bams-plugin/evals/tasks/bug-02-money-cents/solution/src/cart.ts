import type { Line } from "./types";

export interface CartTotals {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

/** discountPercent: 0..100, may be fractional (e.g. 12.5). Discount is computed once on the subtotal, rounded half up. */
export function cartTotals(lines: Line[], discountPercent = 0): CartTotals {
  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const basisPoints = Math.round(discountPercent * 100); // integer math, no float drift
  const discount = Math.floor((subtotal * basisPoints * 2 + 10000) / 20000);
  return { subtotalCents: subtotal, discountCents: discount, totalCents: subtotal - discount };
}

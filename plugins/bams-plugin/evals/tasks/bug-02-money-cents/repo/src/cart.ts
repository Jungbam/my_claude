import type { Line } from "./types";

export interface CartTotals {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

/** discountPercent: 0..100, may be fractional (e.g. 12.5). */
export function cartTotals(lines: Line[], discountPercent = 0): CartTotals {
  let subtotal = 0;
  let discount = 0;
  for (const l of lines) {
    const lineTotal = l.unitPriceCents * l.quantity;
    subtotal += lineTotal;
    discount += Math.floor(lineTotal * (discountPercent / 100));
  }
  return { subtotalCents: subtotal, discountCents: discount, totalCents: subtotal - discount };
}

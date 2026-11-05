import { divRoundHalfUp } from "./money";
import type { Order, Priced } from "./types";

export const FREE_SHIPPING_FROM_CENTS = 5000;
export const FLAT_SHIPPING_CENTS = 599;

export function price(order: Order): Priced {
  const subtotalCents = order.lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const taxCents = divRoundHalfUp(subtotalCents * order.taxRateBp, 10000);
  const shippingCents =
    subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_FROM_CENTS ? 0 : FLAT_SHIPPING_CENTS;
  return {
    subtotalCents,
    taxCents,
    shippingCents,
    totalCents: subtotalCents + taxCents + shippingCents,
  };
}

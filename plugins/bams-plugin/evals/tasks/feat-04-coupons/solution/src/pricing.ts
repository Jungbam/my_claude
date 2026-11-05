import { applyCoupon } from "./coupons";
import { divRoundHalfUp } from "./money";
import type { Order, Priced } from "./types";

export const FREE_SHIPPING_FROM_CENTS = 5000;
export const FLAT_SHIPPING_CENTS = 599;

export function price(order: Order): Priced {
  const subtotalCents = order.lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const effect = applyCoupon(order.coupon, subtotalCents);
  const discountCents = effect?.discountCents ?? 0;
  const taxCents = divRoundHalfUp((subtotalCents - discountCents) * order.taxRateBp, 10000);
  const baseShipping =
    subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_FROM_CENTS ? 0 : FLAT_SHIPPING_CENTS;
  const shippingCents = effect?.freeShipping ? 0 : baseShipping;
  const priced: Priced = {
    subtotalCents,
    discountCents,
    taxCents,
    shippingCents,
    totalCents: subtotalCents - discountCents + taxCents + shippingCents,
  };
  if (effect) priced.coupon = effect.result;
  return priced;
}

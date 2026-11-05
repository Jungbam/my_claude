import { divRoundHalfUp } from "./money";
import type { CouponResult } from "./types";

export interface CouponEffect {
  result: CouponResult;
  discountCents: number;
  freeShipping: boolean;
}

export function applyCoupon(raw: string | undefined, subtotalCents: number): CouponEffect | undefined {
  const code = (raw ?? "").trim().toUpperCase();
  if (!code) return undefined;
  const none = (error: "unknown" | "min_subtotal"): CouponEffect => ({
    result: { code, applied: false, error }, discountCents: 0, freeShipping: false,
  });
  const ok = (discountCents: number, freeShipping = false): CouponEffect => ({
    result: { code, applied: true }, discountCents: Math.min(discountCents, subtotalCents), freeShipping,
  });
  switch (code) {
    case "SAVE10": return ok(divRoundHalfUp(subtotalCents * 10, 100));
    case "FLAT5": return subtotalCents >= 2000 ? ok(500) : none("min_subtotal");
    case "FREESHIP": return ok(0, true);
    default: return none("unknown");
  }
}

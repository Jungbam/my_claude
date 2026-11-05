import { formatCents } from "./money";
import type { Priced } from "./types";

export function formatReceipt(p: Priced): string {
  const lines = [`Subtotal: ${formatCents(p.subtotalCents)}`];
  const c = p.coupon;
  if (c?.applied && p.discountCents > 0) {
    lines.push(`Discount (${c.code}): -${formatCents(p.discountCents)}`);
  }
  if (c && !c.applied) {
    const why = c.error === "min_subtotal" ? "minimum subtotal not met" : "unknown code";
    lines.push(`Coupon "${c.code}" not applied: ${why}`);
  }
  lines.push(`Tax: ${formatCents(p.taxCents)}`);
  const freeShip = c?.applied && c.code === "FREESHIP";
  lines.push(`Shipping: ${formatCents(p.shippingCents)}${freeShip ? " (FREESHIP)" : ""}`);
  lines.push(`Total: ${formatCents(p.totalCents)}`);
  return lines.join("\n");
}

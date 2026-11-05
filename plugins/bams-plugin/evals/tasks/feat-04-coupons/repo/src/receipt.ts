import { formatCents } from "./money";
import type { Priced } from "./types";

export function formatReceipt(p: Priced): string {
  return [
    `Subtotal: ${formatCents(p.subtotalCents)}`,
    `Tax: ${formatCents(p.taxCents)}`,
    `Shipping: ${formatCents(p.shippingCents)}`,
    `Total: ${formatCents(p.totalCents)}`,
  ].join("\n");
}

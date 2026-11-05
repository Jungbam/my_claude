import { price } from "./pricing";
import { formatReceipt } from "./receipt";
import type { Order, Priced } from "./types";

export function checkout(order: Order): { pricing: Priced; receipt: string } {
  if (order.lines.length === 0) throw new Error("empty order");
  const pricing = price(order);
  return { pricing, receipt: formatReceipt(pricing) };
}

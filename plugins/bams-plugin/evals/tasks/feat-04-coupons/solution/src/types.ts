export interface Line {
  sku: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Order {
  lines: Line[];
  taxRateBp: number; // basis points, 800 = 8%
  coupon?: string;
}

export interface CouponResult {
  code: string;
  applied: boolean;
  error?: "unknown" | "min_subtotal";
}

export interface Priced {
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  coupon?: CouponResult;
}

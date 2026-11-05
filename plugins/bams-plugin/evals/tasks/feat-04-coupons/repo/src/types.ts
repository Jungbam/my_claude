export interface Line {
  sku: string;
  unitPriceCents: number;
  quantity: number;
}

export interface Order {
  lines: Line[];
  taxRateBp: number; // basis points, 800 = 8%
}

export interface Priced {
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
}

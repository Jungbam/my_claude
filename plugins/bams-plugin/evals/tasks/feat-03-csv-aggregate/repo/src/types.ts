export interface CustomerSummary {
  customer: string;
  orders: number;
  totalCents: number;
  firstDate: string;
  lastDate: string;
}

export interface SkippedRow {
  line: number;
  reason: "missing_fields" | "bad_amount" | "bad_date";
}

export interface AggregateResult {
  customers: CustomerSummary[];
  skipped: SkippedRow[];
}

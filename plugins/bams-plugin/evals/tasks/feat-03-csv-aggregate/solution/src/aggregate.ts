import { parseCsv } from "./csv";
import type { AggregateResult, CustomerSummary, SkippedRow } from "./types";

function parseAmount(raw: string): number | null {
  let s = raw.trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
  if (s.startsWith("$")) s = s.slice(1).trim();
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1).trim(); }
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
  const [i, f = ""] = s.replace(/,/g, "").split(".");
  const cents = Number(i) * 100 + Number(f.padEnd(2, "0"));
  return neg ? -cents : cents;
}

function validDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function aggregateOrders(csv: string): AggregateResult {
  const rows = parseCsv(csv);
  if (rows.length === 0) return { customers: [], skipped: [] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  for (const c of ["customer", "date", "amount"]) {
    if (idx(c) < 0) throw new Error(`missing column: ${c}`);
  }
  const ci = idx("customer"), di = idx("date"), ai = idx("amount"), si = idx("status");
  const groups = new Map<string, CustomerSummary>();
  const skipped: SkippedRow[] = [];
  rows.slice(1).forEach((r, n) => {
    const line = n + 2;
    if (r.every((c) => c.trim() === "")) return;
    const status = si >= 0 ? (r[si] ?? "").trim().toLowerCase() : "";
    if (status === "cancelled") return;
    const customer = (r[ci] ?? "").trim();
    const date = (r[di] ?? "").trim();
    const amountRaw = (r[ai] ?? "").trim();
    if (!customer || !date || !amountRaw) return void skipped.push({ line, reason: "missing_fields" });
    if (!validDate(date)) return void skipped.push({ line, reason: "bad_date" });
    const cents = parseAmount(amountRaw);
    if (cents === null) return void skipped.push({ line, reason: "bad_amount" });
    const key = customer.toLowerCase();
    const g = groups.get(key);
    if (!g) groups.set(key, { customer, orders: 1, totalCents: cents, firstDate: date, lastDate: date });
    else {
      g.orders += 1; g.totalCents += cents;
      if (date < g.firstDate) g.firstDate = date;
      if (date > g.lastDate) g.lastDate = date;
    }
  });
  const customers = [...groups.values()].sort(
    (a, b) => b.totalCents - a.totalCents || (a.customer < b.customer ? -1 : a.customer > b.customer ? 1 : 0),
  );
  return { customers, skipped };
}

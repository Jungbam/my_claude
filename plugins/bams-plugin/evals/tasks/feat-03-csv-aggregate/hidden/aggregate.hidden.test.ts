import { expect, test } from "bun:test";
import { aggregateOrders } from "../src/aggregate";

const H = "customer,date,amount,status\n";

test("basic grouping, totals in cents, sorted by total desc", () => {
  const r = aggregateOrders(H + "bob,2025-01-05,10.50,paid\nann,2025-01-02,$20,paid\nbob,2025-01-09,5,paid\n");
  expect(r.customers).toEqual([
    { customer: "ann", orders: 1, totalCents: 2000, firstDate: "2025-01-02", lastDate: "2025-01-02" },
    { customer: "bob", orders: 2, totalCents: 1550, firstDate: "2025-01-05", lastDate: "2025-01-09" },
  ]);
  expect(r.skipped).toEqual([]);
});
test("ties by name asc", () => {
  const r = aggregateOrders(H + "zed,2025-01-01,5,x\namy,2025-01-01,5,x");
  expect(r.customers.map((c) => c.customer)).toEqual(["amy", "zed"]);
});
test("amount formats: currency, thousands, quoted, parens refund, decimals", () => {
  const csv = H + 'a,2025-01-01,"$1,200.50",ok\na,2025-01-02,"1,200.5",ok\na,2025-01-03,(15.00),ok\na,2025-01-04,"($1,000)",ok\na,2025-01-05,-5,ok\na,2025-01-06,0.07,ok';
  const r = aggregateOrders(csv);
  // 120050 + 120050 - 1500 - 100000 - 500 + 7
  expect(r.customers[0].totalCents).toBe(138107);
  expect(r.customers[0].orders).toBe(6);
});
test("customer grouping is trimmed and case-insensitive; display name = first seen (trimmed)", () => {
  const r = aggregateOrders(H + " Ann ,2025-01-02,1,x\nANN,2025-01-01,2,x\nann,2025-01-03,3,x");
  expect(r.customers.length).toBe(1);
  expect(r.customers[0].customer).toBe("Ann");
  expect(r.customers[0].totalCents).toBe(600);
  expect(r.customers[0].firstDate).toBe("2025-01-01");
  expect(r.customers[0].lastDate).toBe("2025-01-03");
});
test("quoted customer names with commas", () => {
  const r = aggregateOrders(H + '"Smith, John",2025-02-01,3,x');
  expect(r.customers[0].customer).toBe("Smith, John");
});
test("cancelled rows are ignored silently, even if otherwise invalid", () => {
  const r = aggregateOrders(H + "a,2025-01-01,5,x\na,not-a-date,zzz, CANCELLED \nb,2025-01-01,9,Cancelled");
  expect(r.customers.map((c) => c.customer)).toEqual(["a"]);
  expect(r.skipped).toEqual([]);
});
test("skipped rows reported with 1-based line (header=1), blank lines ignored but counted", () => {
  const csv = H + "a,2025-01-01,5,x\n\nb,2025-13-01,5,x\nc,2025-01-01,abc,x\n,2025-01-01,5,x\nd,2025-01-01\ne,2025-02-30,5,x\nf,2025-01-01,12.345,x";
  const r = aggregateOrders(csv);
  expect(r.skipped).toEqual([
    { line: 4, reason: "bad_date" },
    { line: 5, reason: "bad_amount" },
    { line: 6, reason: "missing_fields" },
    { line: 7, reason: "missing_fields" },
    { line: 8, reason: "bad_date" },
    { line: 9, reason: "bad_amount" },
  ]);
  expect(r.customers.map((c) => c.customer)).toEqual(["a"]);
});
test("date is checked before amount", () => {
  const r = aggregateOrders(H + "a,31/12/2025,abc,x");
  expect(r.skipped).toEqual([{ line: 2, reason: "bad_date" }]);
});
test("columns located by header name, any order, extra columns ignored, status optional", () => {
  const r = aggregateOrders("Amount,note,Customer,DATE\n5,hi,ann,2025-03-01\r\n7,yo,ann,2025-03-02\r\n");
  expect(r.customers).toEqual([{ customer: "ann", orders: 2, totalCents: 1200, firstDate: "2025-03-01", lastDate: "2025-03-02" }]);
});
test("missing required column throws", () => {
  expect(() => aggregateOrders("customer,amount\na,5")).toThrow(/missing column/i);
});
test("empty input yields empty result", () => {
  expect(aggregateOrders(H)).toEqual({ customers: [], skipped: [] });
});

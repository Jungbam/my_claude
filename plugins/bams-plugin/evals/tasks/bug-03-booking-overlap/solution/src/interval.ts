import type { Interval } from "./types";

/** true if the two time ranges share any time (half-open: [start, end)). */
export function overlaps(a: Interval, b: Interval): boolean {
  const as = Date.parse(a.start), ae = Date.parse(a.end);
  const bs = Date.parse(b.start), be = Date.parse(b.end);
  return as < be && bs < ae;
}

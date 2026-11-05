import type { Interval } from "./types";

/** true if the two time ranges share any time. */
export function overlaps(a: Interval, b: Interval): boolean {
  return (
    (a.start <= b.start && b.start <= a.end) ||
    (a.start <= b.end && b.end <= a.end)
  );
}

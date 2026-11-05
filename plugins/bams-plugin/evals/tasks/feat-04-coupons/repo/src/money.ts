export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** round(n / d) with halves rounded up, for non-negative integers. */
export function divRoundHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d));
}

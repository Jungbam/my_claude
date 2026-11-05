import type { Page } from "./paginate";

export function pageLabel(p: Page<unknown>): string {
  return `Page ${p.page} of ${p.totalPages}`;
}

export function rangeLabel(p: Page<unknown>, total: number): string {
  if (total === 0) return "0 results";
  const from = (p.page - 1) * p.pageSize + 1;
  const to = Math.min(p.page * p.pageSize, total);
  return `${from}-${to} of ${total}`;
}

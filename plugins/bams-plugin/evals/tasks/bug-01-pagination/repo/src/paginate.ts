export interface Page<T> {
  items: T[];
  page: number; // 1-based
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function paginate<T>(items: T[], page: number, pageSize: number): Page<T> {
  const totalPages = Math.floor(items.length / pageSize);
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

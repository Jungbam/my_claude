export interface User {
  id: string;
  tenantId: string;
  email: string;
  name: string;
}

export interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string, params?: unknown[]): Promise<void>;
}

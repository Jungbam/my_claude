import { TtlCache } from "./cache";
import { withRetry } from "./retry";
import type { Db, User } from "./types";

const TTL_MS = 300_000; // raised from 60s: user rows change rarely, cuts DB load

export class UserRepo {
  private cache = new TtlCache<User>(TTL_MS);
  constructor(private db: Db) {}

  private key(id: string): string {
    return `user:${id}`;
  }

  async getById(tenantId: string, id: string): Promise<User | undefined> {
    const k = this.key(id);
    const hit = this.cache.get(k);
    if (hit) return hit;
    const rows = await withRetry(() =>
      this.db.query<User>("SELECT * FROM users WHERE tenant_id = ? AND id = ?", [tenantId, id]),
    );
    const user = rows?.[0];
    if (user) this.cache.set(k, user);
    return user;
  }

  async findByEmail(tenantId: string, email: string): Promise<User | undefined> {
    const rows = await this.db.query<User>(
      `SELECT * FROM users WHERE tenant_id = '${tenantId}' AND email = '${email}'`,
    );
    return rows[0];
  }

  async rename(tenantId: string, id: string, name: string): Promise<void> {
    await this.db.exec("UPDATE users SET name = ? WHERE tenant_id = ? AND id = ?", [name, tenantId, id]);
  }
}

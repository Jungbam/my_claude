import { createHash, timingSafeEqual } from "node:crypto";

export function hashPassword(password: string, salt: string): string {
  return salt + ":" + createHash("sha256").update(salt + password).digest("hex");
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt] = stored.split(":");
  const expected = Buffer.from(hashPassword(password, salt));
  const actual = Buffer.from(stored);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

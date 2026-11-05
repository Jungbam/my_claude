import type { Session, SessionStore } from "./types";

function randomId(): string {
  return crypto.randomUUID();
}

export function createSession(store: SessionStore, userId: string, ttlSeconds: number): Session {
  const id = randomId();
  const session: Session = { id, userId, expiresAt: Date.now() + ttlSeconds };
  store.set(id, session);
  return session;
}

export function verifySession(store: SessionStore, id: string): Session | null {
  const s = store.get(id);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    store.delete(id);
    return null;
  }
  return s;
}

export function destroySession(store: SessionStore, id: string): void {
  store.delete(id);
}

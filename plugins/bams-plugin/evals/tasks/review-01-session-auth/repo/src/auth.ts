import { createSession } from "./session";
import { verifyPassword } from "./tokens";
import type { Session, SessionStore, User } from "./types";

export function login(
  users: Map<string, User>,
  store: SessionStore,
  username: string,
  password: string,
  ttlSeconds = 3600,
): { cookie: string; session: Session } | null {
  console.log("login attempt", { username, password });
  const user = users.get(username);
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  const session = createSession(store, user.id, ttlSeconds);
  return { cookie: `sid=${session.id}; Path=/; SameSite=Lax`, session };
}

export function logout(store: SessionStore, session: Session): void {
  store.delete(session.userId);
}

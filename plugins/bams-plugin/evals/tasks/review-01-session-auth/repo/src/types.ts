export interface Session {
  id: string;
  userId: string;
  expiresAt: number; // epoch milliseconds
}

export type SessionStore = Map<string, Session>;

export interface User {
  id: string;
  passwordHash: string;
}

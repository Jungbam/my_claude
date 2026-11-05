# Review of change.diff

- **src/auth.ts login(): plaintext password is logged.** `console.log("login attempt", { username, password })` writes credentials to the logs. Remove it (log the username only).
- **src/session.ts createSession(): TTL unit mismatch.** `ttlSeconds` is added to `Date.now()` (milliseconds) without `* 1000`, so sessions expire 1000x too early. Convert seconds to milliseconds.
- **src/auth.ts logout(): deletes the wrong key.** `store.delete(session.userId)` uses the userId but the store is keyed by session id, so the session is never invalidated. Use `destroySession(store, session.id)`.
- **src/auth.ts login(): session cookie lost `HttpOnly; Secure` flags**, exposing the session id to JavaScript and plain HTTP. Restore them.

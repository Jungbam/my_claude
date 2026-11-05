# Review of change.diff

- **src/userRepo.ts findByEmail(): SQL injection.** tenantId and email are interpolated into the SQL string; use `?` placeholders with params like the other queries.
- **src/retry.ts withRetry(): swallows the final error.** After the last failed attempt it returns undefined instead of rethrowing, so callers see `undefined` (and `rows?.[0]` hides the failure). Rethrow the last error and keep the return type `Promise<T>`.
- **src/userRepo.ts key(): cache key omits tenantId.** `user:${id}` collides across tenants, so one tenant can read another tenant's cached user (data leak). Include tenantId in the key.
- **src/userRepo.ts rename(): no cache invalidation.** The write no longer deletes the cached entry, so reads return a stale name for up to the TTL. Call `cache.delete(key)` after the update.

/**
 * slug-utils.ts
 *
 * Shared slug utilities for viz route handlers.
 */

/** Defensively decode percent-encoded slug. Handles double-encoding. */
export function safeDecodeSlug(raw: string): string {
  try {
    let decoded = raw
    for (let i = 0; i < 2; i++) {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    }
    return decoded
  } catch {
    return raw
  }
}

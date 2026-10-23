/**
 * On-device identifiers.
 *
 * Two needs, both satisfied by a v4 UUID:
 *   - `idempotency_key` on a reading write, so a retry (or an offline outbox drain)
 *     never creates a duplicate — the server dedupes on this key.
 *   - stable local ids for optimistic/outbox rows before the server assigns real ones.
 *
 * These keys need uniqueness, not cryptographic strength, so a Math.random v4 generator
 * is sufficient and keeps the app free of a native crypto dependency. If we later want
 * hardened randomness we can swap the body for expo-crypto's randomUUID without touching
 * callers.
 */
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Alias that reads better at call sites building a write payload. */
export const newIdempotencyKey = newId;

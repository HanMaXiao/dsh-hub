/**
 * Identity and clock.
 *
 * Kept in their own module so `lib/model.js` and `lib/store.js` can agree on
 * one format, and so a test can pin the clock instead of racing it.
 *
 * An id is not random alone: the millisecond prefix keeps `store.json` in
 * insertion order when a human reads it, and it makes a tiebreak stable for
 * two items created in the same millisecond (DESIGN §6 sorts by `createdAt`
 * then `id`, so the two must never collide). The random suffix carries the
 * uniqueness that a same-process burst would otherwise depend on chance for.
 */
import { randomBytes } from 'node:crypto'

/**
 * Mint an id for a new item.
 *
 * @param now Milliseconds since the epoch; injected so tests can pin it.
 * @returns A lowercase, lexicographically time-ordered id.
 */
export function newId(now = Date.now()) {
  return `${now.toString(36)}-${randomBytes(6).toString('hex')}`
}

/**
 * Stamp an instant in the one format the Client parses.
 *
 * `toISOString` is UTC with millisecond precision and always has the `Z`, so
 * `Date.parse` in the browser and `Date` on the Host read the same instant.
 *
 * @param date The instant to stamp; injected so tests can pin it.
 * @returns An ISO-8601 timestamp.
 */
export function nowIso(date = new Date()) {
  return date.toISOString()
}

/**
 * Accept an existing timestamp rather than replacing it.
 *
 * The store is rewritten verbatim from disk on every load, so a stored
 * timestamp has to survive a validate-normalise round trip untouched.
 *
 * @param value A candidate timestamp.
 * @returns Whether `value` is a string `Date.parse` understands.
 */
export function isIsoTimestamp(value) {
  return typeof value === 'string' && value !== '' && Number.isFinite(Date.parse(value))
}

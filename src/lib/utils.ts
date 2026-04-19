/**
 * utils.ts — general purpose utilities
 */

/**
 * Retry an async function up to `retries` times with exponential backoff.
 * Throws the last error if all attempts fail.
 *
 * Delays: 500ms → 1000ms → 2000ms (default 3 attempts)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delayMs = 500,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (retries <= 0) throw err
    await new Promise(r => setTimeout(r, delayMs))
    return withRetry(fn, retries - 1, delayMs * 2)
  }
}

/**
 * Generate a UUID v4.
 * Uses crypto.randomUUID() when available (requires HTTPS or localhost).
 * Falls back to a Math.random()-based implementation for HTTP local network
 * dev (e.g. testing on a phone via http://192.168.x.x:5173).
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // RFC 4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

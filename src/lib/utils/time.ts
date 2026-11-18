/**
 * Request-time clock for Server Components. They render once per request
 * (after reading the session), so "now" is stable for that render.
 */
export function requestNow(): number {
  return Date.now();
}

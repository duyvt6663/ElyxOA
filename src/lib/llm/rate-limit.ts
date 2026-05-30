/**
 * DECISION RECAP — 013 In-Memory Rate Limit
 * - Scope: per-IP, in-memory, RATE_LIMIT_PER_HOUR calls per rolling 3600s window.
 * - Resets on cold start. Durable rate-limiting (Redis/Upstash) is out of scope for V1.
 * - Returns retryAfterSeconds when blocked so the route handler can set the `retry-after`
 *   header and the client can render a clean "rate limited" notice.
 * - `_resetRateLimit` exists purely for tests; production code never calls it.
 *
 * PSEUDO-ALGORITHM (checkRateLimit):
 *   1. Maintain a module-scope Map<ip, number[]> of call timestamps (ms since epoch).
 *   2. On each call: drop timestamps older than (now - 3600_000).
 *   3. If remaining length < RATE_LIMIT_PER_HOUR: push now, return { allowed: true }.
 *   4. Else: retryAfterSeconds = ceil((oldest + 3600_000 - now) / 1000); return blocked.
 */

import { RATE_LIMIT_PER_HOUR } from './config';

const WINDOW_MS = 3600_000;
const callLog = new Map<string, number[]>();

/** Returns `{ allowed: true }` or `{ allowed: false, retryAfterSeconds }`. */
export function checkRateLimit(ip: string, now: number = Date.now()): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const cutoff = now - WINDOW_MS;
  const prior = callLog.get(ip) ?? [];
  const fresh = prior.filter((t) => t > cutoff);

  if (fresh.length >= RATE_LIMIT_PER_HOUR) {
    callLog.set(ip, fresh);
    const retryAfterSeconds = Math.ceil((fresh[0] + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  fresh.push(now);
  callLog.set(ip, fresh);
  return { allowed: true };
}

/** For tests. */
export function _resetRateLimit(): void {
  callLog.clear();
}

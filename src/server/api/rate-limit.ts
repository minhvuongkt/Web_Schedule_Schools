/**
 * Fixed-window in-memory rate limiter. Single-instance only (dev/single-node
 * deploys); document before horizontal scaling — swap for a shared store.
 */

interface WindowState {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, WindowState>();

// Periodically drop expired buckets so the map cannot grow unbounded.
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > SWEEP_INTERVAL_MS) {
    lastSweep = now;
    for (const [k, state] of buckets) {
      if (state.resetAt <= now) buckets.delete(k);
    }
  }

  const state = buckets.get(key);
  if (!state || state.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }
  if (state.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil((state.resetAt - now) / 1000),
    };
  }
  state.count += 1;
  return { allowed: true, remaining: limit - state.count, retryAfterSeconds: 0 };
}

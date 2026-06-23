import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context, Next } from 'hono'

/**
 * Lightweight fixed-window in-memory rate limiter.
 *
 * The demo backend runs as a single process, so a module-level `Map` is a
 * sufficient availability / fund-safety throttle on the gas-sponsored
 * fund-touching routes (faucet drip, USDC_DEMO mint, swap/borrow/lend
 * execution). It is intentionally not a distributed quota: the on-chain
 * per-id faucet cooldown plus the per-recipient drip accounting cover the
 * cross-process angle; this layer just caps request velocity per client.
 *
 * Each route is given its own limiter instance (its own window store) so one
 * route's budget cannot be consumed by traffic to another.
 */
export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number
  /** Maximum requests allowed per client within a window. */
  max: number
  /** Maximum active client keys retained per limiter instance. */
  maxTrackedKeys?: number
}

interface RateWindow {
  count: number
  resetAt: number
}

// Bound the per-limiter key set so a churn of distinct clients (e.g. spoofed
// `x-forwarded-for` values) cannot grow the map without limit. When the cap is
// hit we sweep entries whose window has already elapsed.
const DEFAULT_MAX_TRACKED_KEYS = 10_000

export function rateLimit({
  windowMs,
  max,
  maxTrackedKeys = DEFAULT_MAX_TRACKED_KEYS,
}: RateLimitOptions) {
  const windows = new Map<string, RateWindow>()

  return async function rateLimitMiddleware(c: Context, next: Next) {
    const key = clientKey(c)
    const now = Date.now()

    if (windows.size >= maxTrackedKeys) sweepExpiredWindows(windows, now)
    const existing = windows.get(key)

    if (!existing && windows.size >= maxTrackedKeys) {
      return rateLimitExceeded(c, nextResetSeconds(windows, now))
    }

    if (!existing || now >= existing.resetAt) {
      windows.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    existing.count += 1
    if (existing.count > max) {
      return rateLimitExceeded(c, Math.ceil((existing.resetAt - now) / 1000))
    }

    return next()
  }
}

function sweepExpiredWindows(
  windows: Map<string, RateWindow>,
  now: number,
): void {
  for (const [key, window] of windows) {
    if (now >= window.resetAt) windows.delete(key)
  }
}

function nextResetSeconds(
  windows: Map<string, RateWindow>,
  now: number,
): number {
  const resetAt = Math.min(...Array.from(windows.values(), (w) => w.resetAt))
  if (!Number.isFinite(resetAt)) return 1
  return Math.max(1, Math.ceil((resetAt - now) / 1000))
}

function rateLimitExceeded(c: Context, retryAfterSeconds: number): Response {
  c.header('Retry-After', String(Math.max(1, retryAfterSeconds)))
  return c.json({ error: 'Too many requests' }, 429)
}

/**
 * Identify the caller. Prefer the authenticated identity (`privy-id-token`,
 * read straight from the header since this middleware runs before auth) so an
 * authenticated user is throttled per-user; otherwise fall back to the client
 * IP so an anonymous burst from one host is still bounded.
 */
function clientKey(c: Context): string {
  const idToken = c.req.header('privy-id-token')
  if (idToken) return `user:${idToken}`

  const forwardedFor = c.req.header('x-forwarded-for')
  if (forwardedFor) return `ip:${forwardedFor.split(',')[0]!.trim()}`

  try {
    const address = getConnInfo(c).remote.address
    if (address) return `ip:${address}`
  } catch {
    // No node socket available (e.g. under Hono's in-memory test client).
  }

  return 'ip:unknown'
}

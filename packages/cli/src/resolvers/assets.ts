import type { Asset } from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'

/**
 * @description Resolves an asset symbol (e.g. `USDC_DEMO`, `eth`) to the
 * matching `Asset` entry from an allowlist. Matching is case-insensitive on
 * `metadata.symbol`. The resolver is config-agnostic — callers pass the
 * allowlist explicitly so the same function works for demo config, user
 * config (#411), and tests.
 * @param symbol - User-provided asset symbol from CLI argv.
 * @param allow - Asset allowlist (typically `config.assets.allow`).
 * @returns The first `Asset` whose `metadata.symbol` matches, case-insensitive.
 * @throws `CliError` with code `validation` when no asset matches.
 */
export function resolveAsset(symbol: string, allow: readonly Asset[]): Asset {
  const needle = symbol.toLowerCase()
  const match = allow.find(
    (asset) => asset.metadata.symbol.toLowerCase() === needle,
  )
  if (!match) {
    throw new CliError('validation', `Unknown asset: ${symbol}`, {
      symbol,
      allowed: allow.map((a) => a.metadata.symbol),
    })
  }
  return match
}

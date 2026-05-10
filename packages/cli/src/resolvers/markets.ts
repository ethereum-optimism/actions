import {
  getLendMarketAllowlist,
  type LendMarketConfig,
  type NodeActionsConfig,
} from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s-]/g, '')
}

/**
 * @description Returns every market allowlisted across the configured lend providers. Thin wrapper around `getLendMarketAllowlist(config.lend)`; kept here so CLI call sites read `configuredMarkets(config)` symmetrically with `configuredAssets(config)` / `configuredChains(config)`.
 * @param config - Resolved CLI config.
 * @returns Flat array of every allowlisted market across all providers.
 */
export function configuredMarkets(
  config: NodeActionsConfig<never>,
): readonly LendMarketConfig[] {
  return getLendMarketAllowlist(config.lend)
}

/**
 * @description Resolves a `--market <name>` flag value to the matching `LendMarketConfig` entry from a caller-supplied allowlist. Match is case-insensitive and ignores whitespace / hyphens, so all of `Gauntlet USDC`, `gauntlet-usdc`, `GauntletUSDC`, and `gauntletusdc` resolve to the same market. Throws `CliError('validation')` on miss with an `allowed` list cribbed from the canonical `.name` fields. Mirrors `resolveChain` / `resolveAsset` — pass a pre-collected allowlist (typically `configuredMarkets(config)`).
 * @param name - User-provided market name from CLI argv.
 * @param allow - Market allowlist to search.
 * @returns The matching market entry (carries `address`, `chainId`, `asset`, `lendProvider`).
 * @throws `CliError` with code `validation` when no market matches.
 */
export function resolveMarket(
  name: string,
  allow: readonly LendMarketConfig[],
): LendMarketConfig {
  const target = normalize(name)
  const matches = allow.filter((m) => normalize(m.name) === target)
  if (matches.length === 0) {
    throw new CliError('validation', `Unknown market: ${name}`, {
      market: name,
      allowed: allow.map((m) => ({
        name: m.name,
        chainId: m.chainId,
        symbol: m.asset.metadata.symbol,
      })),
    })
  }
  if (matches.length > 1) {
    // Two providers list a market that normalises to the same key — the agent
    // would otherwise silently pick whichever appears first in iteration order.
    // Surface the ambiguity so the operator fixes the config.
    throw new CliError('validation', `Ambiguous market: ${name}`, {
      market: name,
      matches: matches.map((m) => ({
        name: m.name,
        chainId: m.chainId,
        provider: m.lendProvider,
      })),
    })
  }
  return matches[0] as LendMarketConfig
}

import type {
  LendMarketConfig,
  LendProviderConfig,
  NodeActionsConfig,
} from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s-]/g, '')
}

/**
 * @description Walks `ActionsConfig.lend` and flattens every provider's `marketAllowlist` into a single list. Used by callers as the input to `resolveMarket`. The implementation skips the `settings` sibling key — `LendConfig` mixes provider configs with a sibling `LendSettings` entry, and only provider entries carry `marketAllowlist`.
 * @param config - Resolved CLI config.
 * @returns Flat array of every allowlisted market across all providers.
 */
export function collectMarkets(
  config: NodeActionsConfig<never>,
): readonly LendMarketConfig[] {
  const out: LendMarketConfig[] = []
  for (const [key, value] of Object.entries(config.lend ?? {})) {
    if (key === 'settings') continue
    const provider = value as LendProviderConfig | undefined
    if (provider?.marketAllowlist) out.push(...provider.marketAllowlist)
  }
  return out
}

/**
 * @description Resolves a `--market <name>` flag value to the matching `LendMarketConfig` entry from a caller-supplied allowlist. Match is case-insensitive and ignores whitespace / hyphens, so all of `Gauntlet USDC`, `gauntlet-usdc`, `GauntletUSDC`, and `gauntletusdc` resolve to the same market. Throws `CliError('validation')` on miss with an `allowed` list cribbed from the canonical `.name` fields. Mirrors `resolveChain` / `resolveAsset` — pass a pre-collected allowlist (typically `collectMarkets(config)`).
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
  const match = allow.find((m) => normalize(m.name) === target)
  if (!match) {
    throw new CliError('validation', `Unknown market: ${name}`, {
      market: name,
      allowed: allow.map((m) => m.name),
    })
  }
  return match
}

import type {
  LendMarketConfig,
  NodeActionsConfig,
} from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function collectMarkets(
  config: NodeActionsConfig<never>,
): readonly LendMarketConfig[] {
  const out: LendMarketConfig[] = []
  for (const provider of Object.values(config.lend ?? {})) {
    if (provider?.marketAllowlist) out.push(...provider.marketAllowlist)
  }
  return out
}

/**
 * @description Resolves a `--market <name>` flag value to the matching
 * `LendMarketConfig` entry from any provider's allowlist. Match is
 * case-insensitive and ignores whitespace / hyphens, so all of
 * `Gauntlet USDC`, `gauntlet-usdc`, `GauntletUSDC`, and `gauntletusdc`
 * resolve to the same market. Throws `CliError('validation')` on miss
 * with an `allowed` list cribbed from the canonical `.name` fields.
 * @param name - User-provided market name from CLI argv.
 * @param config - Resolved CLI config.
 * @returns The matching market entry (carries `address`, `chainId`,
 * `asset`, `lendProvider`).
 * @throws `CliError` with code `validation` when no market matches.
 */
export function resolveMarket(
  name: string,
  config: NodeActionsConfig<never>,
): LendMarketConfig {
  const target = normalize(name)
  const markets = collectMarkets(config)
  const match = markets.find((m) => normalize(m.name) === target)
  if (!match) {
    throw new CliError('validation', `Unknown market: ${name}`, {
      market: name,
      allowed: markets.map((m) => m.name),
    })
  }
  return match
}

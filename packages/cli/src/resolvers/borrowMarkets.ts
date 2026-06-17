import {
  BORROW_PROVIDER_NAMES,
  type BorrowMarketConfig,
  borrowProviderForKind,
  type NodeActionsConfig,
} from '@eth-optimism/actions-sdk'

import { CliError } from '@/output/errors.js'
import { normalizeMarketName } from '@/resolvers/normalize.js'

/**
 * @description Returns every borrow market allowlisted across the configured borrow providers. The SDK does not ship a `getBorrowMarketAllowlist` helper, so the CLI flattens `config.borrow` itself by iterating `BORROW_PROVIDER_NAMES`. This keeps the resolver provider-agnostic when new borrow providers join the SDK constant. Mirrors `configuredMarkets` in `resolvers/markets.ts` so call sites read symmetrically.
 * @param config - Resolved CLI config.
 * @returns Flat array of every allowlisted borrow market across all providers.
 */
export function configuredBorrowMarkets(
  config: NodeActionsConfig<never>,
): readonly BorrowMarketConfig[] {
  return BORROW_PROVIDER_NAMES.flatMap(
    (name) => config.borrow?.[name]?.marketAllowlist ?? [],
  )
}

/**
 * @description Resolves a `--market <name>` flag value to the matching `BorrowMarketConfig` entry from a caller-supplied allowlist. Match is case-insensitive and ignores whitespace / hyphens, so `Demo dUSDC / OP`, `demo-dusdc-op`, and `DemoDusdcOp` all resolve to the same market. Throws `CliError('validation')` on miss with an `allowed` list including collateral/borrow asset symbols. Mirrors `resolveMarket` retyped to the borrow shape; the borrow market config carries `collateralAsset` / `borrowAsset` instead of a single `asset`.
 * @param name - User-provided market name from CLI argv.
 * @param allow - Borrow market allowlist to search.
 * @returns The matching borrow market entry (carries `kind`, `marketId`, `chainId`, `collateralAsset`, `borrowAsset`, `borrowProvider`, `marketParams`).
 * @throws `CliError` with code `validation` when no market matches or when two providers normalize to the same name.
 */
export function resolveBorrowMarket(
  name: string,
  allow: readonly BorrowMarketConfig[],
): BorrowMarketConfig {
  const target = normalizeMarketName(name)
  const matches = allow.filter((m) => normalizeMarketName(m.name) === target)
  if (matches.length === 0) {
    throw new CliError('validation', `Unknown borrow market: ${name}`, {
      market: name,
      allowed: allow.map((m) => ({
        name: m.name,
        chainId: m.chainId,
        collateral: m.collateralAsset.metadata.symbol,
        borrow: m.borrowAsset.metadata.symbol,
      })),
    })
  }
  if (matches.length > 1) {
    // Two providers list a market that normalises to the same key. Surface the
    // ambiguity so the operator fixes the config instead of getting a silent
    // first-iteration pick.
    throw new CliError('validation', `Ambiguous borrow market: ${name}`, {
      market: name,
      matches: matches.map((m) => ({
        name: m.name,
        chainId: m.chainId,
        provider: borrowProviderForKind(m.kind),
      })),
    })
  }
  return matches[0] as BorrowMarketConfig
}

import type { LendMarketConfig, LendMarketId } from '@/types/lend.js'

/**
 * Find a lend market configuration from a market allowlist
 * @param marketAllowlist - List of allowed markets
 * @param lendMarketId - Market identifier to find
 * @returns LendMarketConfig if found, undefined otherwise
 */
export function findMarketInAllowlist(
  marketAllowlist: LendMarketConfig[] | undefined,
  lendMarketId: LendMarketId,
): LendMarketConfig | undefined {
  if (!marketAllowlist) {
    return undefined
  }

  return marketAllowlist.find(
    (allowedMarket) =>
      allowedMarket.address.toLowerCase() ===
        lendMarketId.address.toLowerCase() &&
      allowedMarket.chainId === lendMarketId.chainId,
  )
}

import { parseUnits } from 'viem'

import { marketIdMatches } from '@/actions/borrow/core/marketId.js'
import { MarketNotAllowedError } from '@/core/error/errors.js'
import type {
  Amount,
  AmountOrMax,
  AmountWeiOrMax,
  BorrowMarketConfig,
  BorrowMarketId,
  GetBorrowMarketsParams,
} from '@/types/borrow/index.js'

/**
 * Convert a public `Amount` to a wei `bigint`.
 * @description `{ amountRaw }` passes through; `{ amount }` is parsed via
 * `viem.parseUnits` using the asset's decimals.
 */
export function resolveBorrowAmountWei(
  amount: Amount,
  decimals: number,
): bigint {
  if ('amountRaw' in amount) return amount.amountRaw
  return parseUnits(amount.amount.toString(), decimals)
}

/**
 * Convert a public `AmountOrMax` to its internal wire shape.
 * @description `{ max: true }` passes through unchanged so the concrete
 * provider can re-fetch on-chain balance at bundle-build time. Other
 * variants normalize to `{ amountWei }`.
 */
export function resolveBorrowAmountWeiOrMax(
  amount: AmountOrMax,
  decimals: number,
): AmountWeiOrMax {
  if ('max' in amount) return { max: true }
  return { amountWei: resolveBorrowAmountWei(amount, decimals) }
}

/**
 * Validate that a market is allowed by the provider allowlist and absent
 * from the provider blocklist.
 */
export function validateBorrowMarketAllowed(
  market: BorrowMarketConfig,
  config: {
    marketAllowlist?: BorrowMarketConfig[]
    marketBlocklist?: BorrowMarketConfig[]
  },
): void {
  const allowlist = config.marketAllowlist
  if (allowlist && allowlist.length > 0) {
    const hit = allowlist.find((candidate) => marketsMatch(candidate, market))
    if (!hit) {
      throw new MarketNotAllowedError({
        address: market.marketId,
        chainId: market.chainId,
        reason: 'Market is not in the marketAllowlist',
      })
    }
  }

  const blocklist = config.marketBlocklist
  if (!blocklist?.length) return
  const blocked = blocklist.find((candidate) => marketsMatch(candidate, market))
  if (!blocked) return
  throw new MarketNotAllowedError({
    address: market.marketId,
    chainId: market.chainId,
    reason: 'Market is on the marketBlocklist',
  })
}

export function validateBorrowMarketIdAllowed(
  marketId: BorrowMarketId,
  config: { marketAllowlist?: BorrowMarketConfig[] },
): void {
  const allowlist = config.marketAllowlist
  if (!allowlist || allowlist.length === 0) return
  const hit = allowlist.find((market) => marketIdMatches(market, marketId))
  if (hit) return
  throw new MarketNotAllowedError({
    address: marketId.marketId,
    chainId: marketId.chainId,
    reason: 'Market is not in the marketAllowlist',
  })
}

/**
 * Filter the configured allowlist by `getMarkets` query parameters.
 */
export function filterBorrowMarketConfigs(
  config: { marketAllowlist?: BorrowMarketConfig[] },
  params: GetBorrowMarketsParams,
): BorrowMarketConfig[] {
  let markets = config.marketAllowlist ?? []
  if (params.chainId !== undefined) {
    markets = markets.filter((market) => market.chainId === params.chainId)
  }
  if (params.collateralAsset !== undefined) {
    markets = markets.filter(
      (market) => market.collateralAsset === params.collateralAsset,
    )
  }
  if (params.borrowAsset !== undefined) {
    markets = markets.filter(
      (market) => market.borrowAsset === params.borrowAsset,
    )
  }
  return markets
}

function marketsMatch(a: BorrowMarketConfig, b: BorrowMarketConfig): boolean {
  return marketIdMatches(a, b)
}

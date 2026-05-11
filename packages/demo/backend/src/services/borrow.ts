import type { Address } from 'viem'

import { getActions } from '@/config/actions.js'
import { getWallet } from '@/services/wallet.js'
import {
  type AmountExact,
  type AmountWithMax,
  asActionsBorrow,
  asWalletBorrow,
  type BorrowAction,
  type BorrowMarket,
  type BorrowMarketId,
  type BorrowPrice,
  type BorrowQuote,
  type BorrowReceipt,
  type GetBorrowMarketsParams,
  type GetBorrowPriceParams,
} from '@/types/borrow-sdk-stubs.js'

export async function getMarkets(
  params: GetBorrowMarketsParams = {},
): Promise<BorrowMarket[]> {
  const actions = getActions()
  return await asActionsBorrow(actions).getMarkets(params)
}

// ---------- /borrow/price + cache ----------

const PRICE_CACHE_TTL_MS = 10_000 // 10s for demo; plan R4 suggested 1-2s

interface CacheEntry<V> {
  value: V
  expiresAt: number
}

const priceCache = new Map<string, CacheEntry<BorrowPrice>>()

function priceCacheKey(params: GetBorrowPriceParams): string {
  return JSON.stringify(params, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  )
}

/** For tests: drop all cached entries. */
export function _clearPriceCache(): void {
  priceCache.clear()
}

export async function getPrice(
  params: GetBorrowPriceParams,
): Promise<BorrowPrice> {
  const key = priceCacheKey(params)
  const entry = priceCache.get(key)
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value
  }

  const actions = getActions()
  const result = await asActionsBorrow(actions).getPrice(params)
  priceCache.set(key, {
    value: result,
    expiresAt: Date.now() + PRICE_CACHE_TTL_MS,
  })
  return result
}

// ---------- /borrow/quote ----------

export interface GetQuoteServiceParams {
  idToken: string
  action: BorrowAction
  marketId: BorrowMarketId
  borrowAmount?: AmountExact
  collateralAmount?: AmountExact
}

/**
 * Builds a recipient-bound borrow quote. The recipient is resolved from
 * the authenticated `idToken`, not the caller-supplied body, per plan R1.
 * Uncached: the bundle carries the recipient and an `expiresAt`; caching
 * would make staleness a footgun.
 */
export async function getQuote(
  params: GetQuoteServiceParams,
): Promise<BorrowQuote> {
  const wallet = await getWallet(params.idToken)
  if (!wallet) {
    throw new Error('Wallet not found')
  }

  const actions = getActions()
  return await asActionsBorrow(actions).getQuote({
    action: params.action,
    marketId: params.marketId,
    borrowAmount: params.borrowAmount,
    collateralAmount: params.collateralAmount,
    recipient: wallet.address as Address,
  })
}

// ---------- Mutations ----------

/**
 * Resolves the wallet from idToken; throws if missing. Shared by every
 * mutation entry point.
 */
async function resolveWalletOrThrow(idToken: string) {
  const wallet = await getWallet(idToken)
  if (!wallet) {
    throw new Error('Wallet not found')
  }
  return wallet
}

export type OpenPositionServiceParams = { idToken: string } & (
  | {
      marketId: BorrowMarketId
      borrowAmount: AmountExact
      collateralAmount?: AmountExact
      collateralAsset: Address
    }
  | { quote: BorrowQuote }
)

export async function openPosition(
  params: OpenPositionServiceParams,
): Promise<BorrowReceipt> {
  const wallet = await resolveWalletOrThrow(params.idToken)
  const ns = asWalletBorrow(wallet)
  if ('quote' in params) {
    return await ns.openPosition(params.quote)
  }
  return await ns.openPosition({
    marketId: params.marketId,
    borrowAmount: params.borrowAmount,
    collateralAmount: params.collateralAmount,
    collateralAsset: params.collateralAsset,
  })
}

export type ClosePositionServiceParams = { idToken: string } & (
  | {
      marketId: BorrowMarketId
      borrowAmount: AmountWithMax
      collateralAmount?: AmountWithMax
    }
  | { quote: BorrowQuote }
)

export async function closePosition(
  params: ClosePositionServiceParams,
): Promise<BorrowReceipt> {
  const wallet = await resolveWalletOrThrow(params.idToken)
  const ns = asWalletBorrow(wallet)
  if ('quote' in params) {
    return await ns.closePosition(params.quote)
  }
  return await ns.closePosition({
    marketId: params.marketId,
    borrowAmount: params.borrowAmount,
    collateralAmount: params.collateralAmount,
  })
}

export type DepositCollateralServiceParams = { idToken: string } & (
  | { marketId: BorrowMarketId; amount: AmountExact }
  | { quote: BorrowQuote }
)

export async function depositCollateral(
  params: DepositCollateralServiceParams,
): Promise<BorrowReceipt> {
  const wallet = await resolveWalletOrThrow(params.idToken)
  const ns = asWalletBorrow(wallet)
  if ('quote' in params) {
    return await ns.depositCollateral(params.quote)
  }
  return await ns.depositCollateral({
    marketId: params.marketId,
    amount: params.amount,
  })
}

export type WithdrawCollateralServiceParams = { idToken: string } & (
  | { marketId: BorrowMarketId; amount: AmountWithMax }
  | { quote: BorrowQuote }
)

export async function withdrawCollateral(
  params: WithdrawCollateralServiceParams,
): Promise<BorrowReceipt> {
  const wallet = await resolveWalletOrThrow(params.idToken)
  const ns = asWalletBorrow(wallet)
  if ('quote' in params) {
    return await ns.withdrawCollateral(params.quote)
  }
  return await ns.withdrawCollateral({
    marketId: params.marketId,
    amount: params.amount,
  })
}

export type RepayServiceParams = { idToken: string } & (
  | { marketId: BorrowMarketId; amount: AmountWithMax }
  | { quote: BorrowQuote }
)

export async function repay(
  params: RepayServiceParams,
): Promise<BorrowReceipt> {
  const wallet = await resolveWalletOrThrow(params.idToken)
  const ns = asWalletBorrow(wallet)
  if ('quote' in params) {
    return await ns.repay(params.quote)
  }
  return await ns.repay({
    marketId: params.marketId,
    amount: params.amount,
  })
}

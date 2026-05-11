import { getActions } from '@/config/actions.js'
import {
  asActionsBorrow,
  type BorrowMarket,
  type BorrowPrice,
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

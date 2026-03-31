import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import type { Address } from 'viem'
import type { SupportedChainId } from '@eth-optimism/actions-sdk/react'
import type { SwapAsset } from '@/hooks/useSwapAssets'
import { displaySymbol, isStablecoin } from '@/utils/tokenDisplay'

export interface TokenBalanceRow {
  symbol: string
  logo: string
  balance: number
  usdValue: number
}

interface UseTotalBalanceParams {
  assets: SwapAsset[]
  getPrice: (params: {
    tokenInAddress: Address
    tokenOutAddress: Address
    chainId: SupportedChainId
    amountIn?: number
  }) => Promise<{ amountOut: number } | null>
}

export function useTotalBalance({ assets, getPrice }: UseTotalBalanceParams) {
  const priceCache = useRef<Map<string, number>>(new Map())
  const [prices, setPrices] = useState<Map<string, number>>(new Map())

  // Fetch prices for non-USDC assets concurrently (only new symbols)
  const fetchPrices = useCallback(async () => {
    const usdcAsset = assets.find((a) => isStablecoin(a.asset.metadata.symbol))
    if (!usdcAsset) return

    const toFetch = assets.filter(
      (a) =>
        !isStablecoin(a.asset.metadata.symbol) &&
        !priceCache.current.has(a.asset.metadata.symbol),
    )
    if (toFetch.length === 0) return

    const results = await Promise.allSettled(
      toFetch.map(async (asset) => {
        const tokenAddress = asset.asset.address[asset.chainId] as
          | Address
          | undefined
        const usdcAddress = usdcAsset.asset.address[asset.chainId] as
          | Address
          | undefined
        if (!tokenAddress || !usdcAddress) return null
        const quote = await getPrice({
          tokenInAddress: tokenAddress,
          tokenOutAddress: usdcAddress,
          chainId: asset.chainId,
          amountIn: 1,
        })
        return quote
          ? {
              symbol: asset.asset.metadata.symbol,
              price: quote.amountOut || 0,
            }
          : null
      }),
    )

    let updated = false
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        priceCache.current.set(result.value.symbol, result.value.price)
        updated = true
      }
    }
    if (updated) setPrices(new Map(priceCache.current))
  }, [assets, getPrice])

  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  // Derive balances from assets + cached prices (reactive to balance changes)
  const tokenBalances = useMemo<TokenBalanceRow[]>(() => {
    return assets
      .map((asset) => {
        const balance = parseFloat(asset.balance) || 0
        const symbol = displaySymbol(asset.asset.metadata.symbol)

        if (isStablecoin(asset.asset.metadata.symbol)) {
          return { symbol, logo: asset.logo, balance, usdValue: balance }
        }

        const price = prices.get(asset.asset.metadata.symbol) ?? 0
        return { symbol, logo: asset.logo, balance, usdValue: balance * price }
      })
      .filter((token) => token.balance > 0)
  }, [assets, prices])

  const totalUsd = useMemo(
    () => tokenBalances.reduce((sum, t) => sum + t.usdValue, 0),
    [tokenBalances],
  )

  return { tokenBalances, totalUsd, isLoading: false }
}

import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import type { Address } from 'viem'
import type { SupportedChainId } from '@eth-optimism/actions-sdk/react'
import type { SwapAsset } from '@/hooks/useSwapAssets'

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
  }) => Promise<{ price: string; amountOutFormatted: string } | null>
}

function displaySymbol(symbol: string): string {
  return symbol.replace('_DEMO', '')
}

function isStablecoin(symbol: string): boolean {
  return displaySymbol(symbol) === 'USDC'
}

export function useTotalBalance({ assets, getPrice }: UseTotalBalanceParams) {
  const priceCache = useRef<Map<string, number>>(new Map())
  const [prices, setPrices] = useState<Map<string, number>>(new Map())

  // Fetch prices for non-USDC assets (only when new symbols appear)
  const fetchPrices = useCallback(async () => {
    const usdcAsset = assets.find((a) => isStablecoin(a.asset.metadata.symbol))
    if (!usdcAsset) return

    for (const asset of assets) {
      if (isStablecoin(asset.asset.metadata.symbol)) continue

      const cacheKey = asset.asset.metadata.symbol
      if (priceCache.current.has(cacheKey)) continue

      const tokenAddress = asset.asset.address[asset.chainId] as
        | Address
        | undefined
      const usdcAddress = usdcAsset.asset.address[asset.chainId] as
        | Address
        | undefined
      if (!tokenAddress || !usdcAddress) continue

      const quote = await getPrice({
        tokenInAddress: tokenAddress,
        tokenOutAddress: usdcAddress,
        chainId: asset.chainId,
        amountIn: 1,
      })

      if (quote) {
        const price = parseFloat(quote.amountOutFormatted) || 0
        priceCache.current.set(cacheKey, price)
        setPrices(new Map(priceCache.current))
      }
    }
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

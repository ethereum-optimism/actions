import { useState, useEffect, useRef, useCallback } from 'react'
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
  const [tokenBalances, setTokenBalances] = useState<TokenBalanceRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const priceCache = useRef<Map<string, number>>(new Map())

  const computeBalances = useCallback(async () => {
    if (assets.length === 0) {
      setTokenBalances([])
      return
    }

    setIsLoading(true)

    // Find a USDC asset to use as quote currency
    const usdcAsset = assets.find((a) => isStablecoin(a.asset.metadata.symbol))

    const rows: TokenBalanceRow[] = []

    for (const asset of assets) {
      const balance = parseFloat(asset.balance) || 0
      const symbol = displaySymbol(asset.asset.metadata.symbol)

      if (isStablecoin(asset.asset.metadata.symbol)) {
        rows.push({ symbol, logo: asset.logo, balance, usdValue: balance })
        continue
      }

      // Check cache
      const cacheKey = asset.asset.metadata.symbol
      const cachedPrice = priceCache.current.get(cacheKey)
      if (cachedPrice !== undefined) {
        rows.push({
          symbol,
          logo: asset.logo,
          balance,
          usdValue: balance * cachedPrice,
        })
        continue
      }

      // Fetch price via swap quote (token → USDC)
      if (usdcAsset && balance > 0) {
        const tokenAddress = asset.asset.address[asset.chainId] as Address
        const usdcAddress = usdcAsset.asset.address[
          usdcAsset.chainId
        ] as Address

        const quote = await getPrice({
          tokenInAddress: tokenAddress,
          tokenOutAddress: usdcAddress,
          chainId: asset.chainId,
          amountIn: 1,
        })

        if (quote) {
          const pricePerUnit = parseFloat(quote.amountOutFormatted) || 0
          priceCache.current.set(cacheKey, pricePerUnit)
          rows.push({
            symbol,
            logo: asset.logo,
            balance,
            usdValue: balance * pricePerUnit,
          })
          continue
        }
      }

      rows.push({ symbol, logo: asset.logo, balance, usdValue: 0 })
    }

    setTokenBalances(rows)
    setIsLoading(false)
  }, [assets, getPrice])

  useEffect(() => {
    computeBalances()
  }, [computeBalances])

  const totalUsd = tokenBalances.reduce((sum, t) => sum + t.usdValue, 0)

  return { tokenBalances, totalUsd, isLoading }
}

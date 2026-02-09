import { useState, useEffect, useCallback, useRef } from 'react'
import type { Address } from 'viem'
import type { SupportedChainId } from '@eth-optimism/actions-sdk/react'

interface TokenBalanceEntry {
  symbol: string
  balance: string
  logo: string
  usdValue: number
}

interface UseTotalBalanceParams {
  tokenBalances: Array<{
    symbol: string
    balance: string
    logo: string
    chainId: SupportedChainId
    address: Address
  }>
  getPrice: (params: {
    tokenInAddress: Address
    tokenOutAddress: Address
    chainId: SupportedChainId
    amountIn?: number
  }) => Promise<{
    price: string
    priceImpact: number
    amountOutFormatted: string
  } | null>
  usdcAddress: Address
  usdcChainId: SupportedChainId
}

export function useTotalBalance({
  tokenBalances,
  getPrice,
  usdcAddress,
  usdcChainId,
}: UseTotalBalanceParams) {
  const [entries, setEntries] = useState<TokenBalanceEntry[]>([])
  const [totalUsd, setTotalUsd] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const ethPriceCache = useRef<{ price: number; timestamp: number } | null>(null)
  const CACHE_TTL = 60_000 // 1 minute

  const getCachedEthPrice = useCallback(async (ethAddress: Address, chainId: SupportedChainId): Promise<number> => {
    const now = Date.now()
    if (ethPriceCache.current && now - ethPriceCache.current.timestamp < CACHE_TTL) {
      return ethPriceCache.current.price
    }

    const result = await getPrice({
      tokenInAddress: ethAddress,
      tokenOutAddress: usdcAddress,
      chainId,
      amountIn: 1,
    })

    if (result) {
      const price = parseFloat(result.amountOutFormatted)
      ethPriceCache.current = { price, timestamp: now }
      return price
    }

    return ethPriceCache.current?.price ?? 0
  }, [getPrice, usdcAddress])

  const computeBalances = useCallback(async () => {
    if (tokenBalances.length === 0) return

    setIsLoading(true)
    try {
      const results: TokenBalanceEntry[] = []
      let total = 0

      for (const token of tokenBalances) {
        const bal = parseFloat(token.balance) || 0
        let usdValue = 0

        if (token.symbol.includes('USDC')) {
          usdValue = bal
        } else if (token.symbol === 'ETH') {
          const ethPrice = await getCachedEthPrice(token.address, token.chainId)
          usdValue = bal * ethPrice
        } else {
          // For other tokens, try to get price via USDC quote
          try {
            const result = await getPrice({
              tokenInAddress: token.address,
              tokenOutAddress: usdcAddress,
              chainId: token.chainId,
              amountIn: 1,
            })
            if (result) {
              usdValue = bal * parseFloat(result.amountOutFormatted)
            }
          } catch {
            usdValue = 0
          }
        }

        results.push({
          symbol: token.symbol.replace('_DEMO', ''),
          balance: token.balance,
          logo: token.logo,
          usdValue,
        })
        total += usdValue
      }

      setEntries(results)
      setTotalUsd(total)
    } finally {
      setIsLoading(false)
    }
  }, [tokenBalances, getCachedEthPrice, getPrice, usdcAddress])

  useEffect(() => {
    computeBalances()
  }, [computeBalances])

  return { entries, totalUsd, isLoading }
}

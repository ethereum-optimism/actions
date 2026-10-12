import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import type { Address } from 'viem'
import type {
  Asset,
  SupportedChainId,
  TokenBalance,
} from '@eth-optimism/actions-sdk/react'
import { WETH } from '@eth-optimism/actions-sdk/react'
import { getAssetLogo } from '@/constants/logos'
import { displaySymbol, isStablecoin } from '@/utils/tokenDisplay'

export interface TokenBalanceRow {
  symbol: string
  logo: string
  balance: number
  usdValue: number
}

interface UseTotalBalanceParams {
  /**
   * Every asset the wallet holds, straight from the wallet layer. Not the
   * swap asset list: that one is filtered to the swap `marketAllowlist`, so
   * deriving the wallet total from it hides anything the wallet holds but
   * cannot swap — native ETH in particular.
   */
  balances: TokenBalance[]
  getPrice: (params: {
    tokenInAddress: Address
    tokenOutAddress: Address
    chainId: SupportedChainId
    amountIn?: number
  }) => Promise<{ amountOut: number } | null>
}

/**
 * The chain a balance is priced and displayed on. Mirrors the pick made when
 * building swap assets, so a token reads the same in both places.
 */
function primaryChainId(balance: TokenBalance): SupportedChainId {
  return Number(Object.keys(balance.chains)[0] ?? 84532) as SupportedChainId
}

/**
 * The ERC-20 address to quote an asset against. Native assets have no address
 * to trade, so they are priced through their wrapped equivalent, which is 1:1
 * — on every chain this SDK supports, native is ETH and the wrapper is WETH.
 */
function quotableAddress(
  asset: Asset,
  chainId: SupportedChainId,
): Address | undefined {
  const address = asset.address[chainId]
  if (address && address !== 'native') {
    return address as Address
  }
  return WETH.address[chainId] as Address | undefined
}

export function useTotalBalance({ balances, getPrice }: UseTotalBalanceParams) {
  const priceCache = useRef<Map<string, number>>(new Map())
  const [prices, setPrices] = useState<Map<string, number>>(new Map())

  // Fetch prices for non-USDC assets concurrently (only new symbols)
  const fetchPrices = useCallback(async () => {
    const usdcBalance = balances.find((b) =>
      isStablecoin(b.asset.metadata.symbol),
    )
    if (!usdcBalance) return

    const toFetch = balances.filter(
      (b) =>
        !isStablecoin(b.asset.metadata.symbol) &&
        !priceCache.current.has(b.asset.metadata.symbol),
    )
    if (toFetch.length === 0) return

    const results = await Promise.allSettled(
      toFetch.map(async (balance) => {
        const chainId = primaryChainId(balance)
        const tokenAddress = quotableAddress(balance.asset, chainId)
        const usdcAddress = quotableAddress(usdcBalance.asset, chainId)
        if (!tokenAddress || !usdcAddress) return null
        const quote = await getPrice({
          tokenInAddress: tokenAddress,
          tokenOutAddress: usdcAddress,
          chainId,
          amountIn: 1,
        })
        return quote
          ? {
              symbol: balance.asset.metadata.symbol,
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
  }, [balances, getPrice])

  useEffect(() => {
    fetchPrices()
  }, [fetchPrices])

  // Derive rows from held balances + cached prices (reactive to balance changes)
  const tokenBalances = useMemo<TokenBalanceRow[]>(() => {
    return balances
      .map((balance) => {
        const amount = balance.totalBalance
        const symbol = displaySymbol(balance.asset.metadata.symbol)
        const logo = getAssetLogo(balance.asset.metadata.symbol)

        if (isStablecoin(balance.asset.metadata.symbol)) {
          return { symbol, logo, balance: amount, usdValue: amount }
        }

        const price = prices.get(balance.asset.metadata.symbol) ?? 0
        return { symbol, logo, balance: amount, usdValue: amount * price }
      })
      .filter((token) => token.balance > 0)
  }, [balances, prices])

  const totalUsd = useMemo(
    () => tokenBalances.reduce((sum, t) => sum + t.usdValue, 0),
    [tokenBalances],
  )

  return { tokenBalances, totalUsd, isLoading: false }
}

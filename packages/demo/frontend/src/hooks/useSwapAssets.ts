import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  Asset,
  SupportedChainId,
  TokenBalance,
} from '@eth-optimism/actions-sdk/react'

import { getAssetLogo } from '@/constants/logos'

export interface SwapAsset {
  asset: Asset
  logo: string
  balance: string
  chainId: SupportedChainId
}

interface UseSwapAssetsParams {
  /** Callback to fetch configured assets — abstracts wallet type */
  getConfiguredAssets: () => Promise<Asset[]>
  /** User's current token balances (from wallet layer) */
  tokenBalances?: TokenBalance[]
  /** Whether the component is ready to fetch */
  enabled: boolean
  /** Restrict to only these assets (from swap config marketAllowlist) */
  marketAllowlist?: Asset[]
}

/**
 * Shared hook for fetching swap assets.
 * Uses getConfiguredAssets callback to abstract frontend vs backend wallet differences.
 */
export function useSwapAssets({
  getConfiguredAssets,
  tokenBalances,
  enabled,
  marketAllowlist,
}: UseSwapAssetsParams) {
  const [assets, setAssets] = useState<SwapAsset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const marketAllowlistRef = useRef(marketAllowlist)
  marketAllowlistRef.current = marketAllowlist
  const tokenBalancesRef = useRef(tokenBalances)
  tokenBalancesRef.current = tokenBalances

  const fetchAssets = useCallback(async () => {
    if (!enabled) return

    setIsLoading(true)
    setError(null)

    try {
      let configuredAssets = await getConfiguredAssets()

      // Filter to swap allowlist if provided
      if (marketAllowlistRef.current?.length) {
        const allowed = new Set(
          marketAllowlistRef.current.map((a) => a.metadata.symbol),
        )
        configuredAssets = configuredAssets.filter((a) =>
          allowed.has(a.metadata.symbol),
        )
      }

      // Step 3: Use provided token balances (via ref to avoid refetch cascade)
      const balances = tokenBalancesRef.current ?? []

      // Step 4: Build asset map for quick lookup
      const assetMap = new Map<string, Asset>()
      configuredAssets.forEach((asset) => {
        assetMap.set(asset.metadata.symbol, asset)
      })

      // Step 5: Match balances with configured assets, dedup by symbol
      const seen = new Set<string>()
      const formattedAssets = balances
        .map((balance): SwapAsset | null => {
          const asset = assetMap.get(balance.symbol)
          if (!asset || seen.has(balance.symbol)) return null
          seen.add(balance.symbol)

          const logo = getAssetLogo(balance.symbol)

          return {
            asset,
            logo,
            balance: balance.totalFormattedBalance,
            chainId: balance.chainBalances[0]?.chainId || 84532,
          }
        })
        .filter((item): item is SwapAsset => item !== null)

      setAssets(formattedAssets)
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to fetch assets')
      setError(error)
    } finally {
      setIsLoading(false)
    }
  }, [getConfiguredAssets, enabled])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  return {
    assets,
    isLoading,
    error,
    refetch: fetchAssets,
  }
}

import { useState, useEffect, useCallback, useMemo } from 'react'
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
 * Fetches configured assets once, then reactively maps balances as they update.
 */
export function useSwapAssets({
  getConfiguredAssets,
  tokenBalances,
  enabled,
  marketAllowlist,
}: UseSwapAssetsParams) {
  const [configuredAssets, setConfiguredAssets] = useState<Asset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Fetch configured assets (only re-runs when getConfiguredAssets changes)
  const fetchAssets = useCallback(async () => {
    if (!enabled) return

    setIsLoading(true)
    setError(null)

    try {
      const assets = await getConfiguredAssets()
      setConfiguredAssets(assets)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch assets'))
    } finally {
      setIsLoading(false)
    }
  }, [getConfiguredAssets, enabled])

  useEffect(() => {
    fetchAssets()
  }, [fetchAssets])

  // Reactively map balances onto configured assets — updates whenever either changes
  const assets = useMemo<SwapAsset[]>(() => {
    if (!configuredAssets.length || !tokenBalances?.length) return []

    // Filter to allowlist if provided
    const allowedSymbols = marketAllowlist?.length
      ? new Set(marketAllowlist.map((a) => a.metadata.symbol))
      : null

    const assetMap = new Map<string, Asset>()
    for (const asset of configuredAssets) {
      if (!allowedSymbols || allowedSymbols.has(asset.metadata.symbol)) {
        assetMap.set(asset.metadata.symbol, asset)
      }
    }

    const seen = new Set<string>()
    return tokenBalances
      .map((balance): SwapAsset | null => {
        const symbol = balance.asset.metadata.symbol
        const asset = assetMap.get(symbol)
        if (!asset || seen.has(symbol)) return null
        seen.add(symbol)

        // Find first chain with a balance
        const firstChainId = Object.keys(balance.chains)[0]

        return {
          asset,
          logo: getAssetLogo(symbol),
          balance: balance.totalBalance.toString(),
          chainId: firstChainId ? (Number(firstChainId) as SupportedChainId) : (84532 as SupportedChainId),
        }
      })
      .filter((item): item is SwapAsset => item !== null)
  }, [configuredAssets, tokenBalances, marketAllowlist])

  return {
    assets,
    isLoading,
    error,
    refetch: fetchAssets,
  }
}

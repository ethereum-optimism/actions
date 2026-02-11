import { useState, useEffect, useCallback } from 'react'
import type {
  Asset,
  SupportedChainId,
  TokenBalance,
} from '@eth-optimism/actions-sdk/react'

import { actionsApi } from '@/api/actionsApi'

export interface SwapAsset {
  asset: Asset
  logo: string
  balance: string
  chainId: SupportedChainId
}

interface UseSwapAssetsParams {
  /**
   * Actions instance for frontend wallets (Dynamic, Turnkey)
   * If provided, uses actions.getSupportedAssets()
   */
  actions?: { getSupportedAssets: () => Asset[] }
  /**
   * Auth headers provider for backend wallets (Privy)
   * If provided, uses API to fetch assets
   */
  getAuthHeaders?: () => Promise<{ Authorization: string } | undefined>
  /**
   * Token balances fetcher
   */
  getTokenBalances: () => Promise<TokenBalance[]>
  /**
   * Whether the component is ready to fetch
   */
  enabled: boolean
  /**
   * Restrict to only these assets (from swap config marketAllowlist).
   * If omitted, all configured assets are shown.
   */
  marketAllowlist?: Asset[]
}

/**
 * Shared hook for fetching swap assets
 * @description Works with both frontend and backend wallet providers.
 * - Frontend wallets: uses actions.getSupportedAssets()
 * - Backend wallets: fetches from /assets API endpoint
 * Then matches assets with user balances.
 */
export function useSwapAssets({
  actions,
  getAuthHeaders,
  getTokenBalances,
  enabled,
  marketAllowlist,
}: UseSwapAssetsParams) {
  const [assets, setAssets] = useState<SwapAsset[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchAssets = useCallback(async () => {
    if (!enabled) return

    setIsLoading(true)
    setError(null)

    try {
      // Step 1: Get configured assets
      let configuredAssets: Asset[]

      if (actions) {
        // Frontend wallet path: use actions.getSupportedAssets()
        configuredAssets = actions.getSupportedAssets()
      } else if (getAuthHeaders) {
        // Backend wallet path: fetch from API
        const headers = await getAuthHeaders()
        configuredAssets = await actionsApi.getAssets(headers)
      } else {
        throw new Error(
          'Either actions instance or getAuthHeaders must be provided',
        )
      }

      // Step 2: Filter to swap allowlist if provided
      if (marketAllowlist?.length) {
        const allowed = new Set(
          marketAllowlist.map((a) => a.metadata.symbol),
        )
        configuredAssets = configuredAssets.filter((a) =>
          allowed.has(a.metadata.symbol),
        )
      }

      // Step 3: Get user balances
      const balances = await getTokenBalances()

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
      console.error('Failed to fetch swap assets:', error)
    } finally {
      setIsLoading(false)
    }
  }, [actions, getAuthHeaders, getTokenBalances, enabled, marketAllowlist])

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

/**
 * Get asset logo path based on symbol
 */
function getAssetLogo(symbol: string): string {
  const logoMap: Record<string, string> = {
    USDC_DEMO: '/usd-coin-usdc-logo.svg',
    ETH: '/eth.svg',
    OP_DEMO: '/OP.svg',
  }

  return logoMap[symbol] || '/usd-coin-usdc-logo.svg'
}

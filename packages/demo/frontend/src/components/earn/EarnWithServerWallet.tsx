import { useState, useCallback, useEffect, useMemo } from 'react'
import type { Address } from 'viem'
import Earn from './Earn'
import type { WalletProviderConfig } from '@/constants/walletProviders'
import type { Asset } from '@eth-optimism/actions-sdk/react'
import { actionsApi } from '@/api/actionsApi'
import type { LendProviderOperations } from '@/hooks/useLendProvider'

interface EarnWithServerWalletProps {
  ready: boolean
  logout: () => Promise<void>
  getAuthHeaders: () => Promise<{ Authorization: string } | undefined>
  selectedProvider: WalletProviderConfig
}

/**
 * Wrapper for server wallet providers (Privy)
 * Builds operations object using API calls and delegates to Earn
 */
export function EarnWithServerWallet({
  getAuthHeaders,
  logout,
  selectedProvider,
  ready,
}: EarnWithServerWalletProps) {
  const [walletAddress, setWalletAddress] = useState<Address | null>(null)

  const operations = useMemo<LendProviderOperations>(
    () => ({
      getTokenBalances: async () => {
        const headers = await getAuthHeaders()
        return actionsApi.getWalletBalance(headers)
      },
      getMarkets: async () => {
        const headers = await getAuthHeaders()
        return actionsApi.getMarkets(headers)
      },
      getPosition: async (marketId) => {
        const headers = await getAuthHeaders()
        return actionsApi.getPosition({ marketId }, headers)
      },
      mintAsset: async (asset: Asset) => {
        const headers = await getAuthHeaders()
        if (asset.metadata.symbol === 'ETH' && asset.type === 'native') {
          if (!walletAddress) throw new Error('Wallet address not available')
          await actionsApi.dripEthToWallet(walletAddress)
          return
        }
        return actionsApi.mintDemoUsdcToWallet(headers)
      },
      openPosition: async (params) => {
        const headers = await getAuthHeaders()
        return actionsApi.openLendPosition(params, headers)
      },
      closePosition: async (params) => {
        const headers = await getAuthHeaders()
        return actionsApi.closeLendPosition(params, headers)
      },
    }),
    [getAuthHeaders, walletAddress],
  )

  const fetchWalletAddress = useCallback(async () => {
    const headers = await getAuthHeaders()
    const { address } = await actionsApi.getWallet(headers)
    setWalletAddress(address)
  }, [getAuthHeaders])

  useEffect(() => {
    if (ready) fetchWalletAddress()
  }, [ready, fetchWalletAddress])

  return (
    <Earn
      operations={operations}
      ready={ready}
      logout={logout}
      walletAddress={walletAddress}
      providerConfig={selectedProvider}
      logPrefix="[EarnWithServerWallet]"
    />
  )
}

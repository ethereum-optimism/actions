import { useState, useCallback, useEffect, useMemo } from 'react'
import { type Address } from 'viem'
import Earn from './Earn'
import type { WalletProviderConfig } from '@/constants/walletProviders'
import type { Asset } from '@eth-optimism/actions-sdk/react'
import { actionsApi } from '@/api/actionsApi'
import { useEarnData, type EarnOperations } from '@/hooks/useEarnData'

interface EarnWithServerWalletProps {
  ready: boolean
  logout: () => Promise<void>
  userId?: string
  embeddedWalletExists: boolean
  getAuthHeaders: () => Promise<
    | {
        Authorization: string
      }
    | undefined
  >
  userEmailAddress?: string
  selectedProvider: WalletProviderConfig
}

/**
 * Container component that handles server wallet provider logic
 * and passes data/callbacks to the presentational Earn component
 */
export function EarnWithServerWallet({
  getAuthHeaders,
  logout,
  selectedProvider,
  ready,
}: EarnWithServerWalletProps) {
  const [walletAddress, setWalletAddress] = useState<Address | null>(null)

  // Create operations object for the shared hook
  const operations = useMemo<EarnOperations>(
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

        if (asset.metadata.symbol.includes('WETH')) {
          if (!walletAddress) {
            throw new Error('Wallet address not available')
          }
          await actionsApi.dripEthToWallet(walletAddress)
          return
        } else {
          return await actionsApi.mintDemoUsdcToWallet(headers)
        }
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

  const {
    markets,
    selectedMarket,
    handleMarketSelect,
    isLoadingMarkets,
    marketPositions,
    assetBalance,
    isLoadingBalance,
    apy,
    isLoadingApy,
    depositedAmount,
    isLoadingPosition,
    isInitialLoad,
    handleMintAsset,
    handleTransaction,
  } = useEarnData({
    operations,
    ready,
    logPrefix: '[EarnWithServerWallet]',
  })

  // Fetch wallet address
  const fetchWalletAddress = useCallback(async () => {
    const headers = await getAuthHeaders()
    const { address } = await actionsApi.getWallet(headers)
    setWalletAddress(address)
  }, [getAuthHeaders])

  useEffect(() => {
    if (ready) {
      fetchWalletAddress()
    }
  }, [ready, fetchWalletAddress])

  return (
    <Earn
      ready={ready}
      selectedProviderConfig={selectedProvider}
      walletAddress={walletAddress}
      logout={logout}
      usdcBalance={assetBalance}
      isLoadingBalance={isLoadingBalance}
      apy={apy}
      isLoadingApy={isLoadingApy}
      depositedAmount={depositedAmount}
      isLoadingPosition={isLoadingPosition}
      isInitialLoad={isInitialLoad}
      onMintUSDC={handleMintAsset}
      onTransaction={handleTransaction}
      markets={markets}
      selectedMarket={selectedMarket}
      onMarketSelect={handleMarketSelect}
      isLoadingMarkets={isLoadingMarkets}
      marketPositions={marketPositions}
    />
  )
}

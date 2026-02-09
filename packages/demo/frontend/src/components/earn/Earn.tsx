import { useState, useCallback, useEffect } from 'react'
import type { Address } from 'viem'
import type { SupportedChainId } from '@eth-optimism/actions-sdk/react'
import { Action } from './Action'
import LentBalance from './LentBalance'
import ActivityLog from './ActivityLog'
import Info from './Info'
import { WalletProviderDropdown } from './WalletProviderDropdown'
import type { WalletProviderConfig } from '@/constants/walletProviders'
import { ActivityHighlightProvider } from '@/contexts/ActivityHighlightContext'
import {
  LendProviderContextProvider,
  useLendProviderContext,
} from '@/contexts/LendProviderContext'
import { MarketSelector } from './MarketSelector'
import type { LendProviderOperations } from '@/hooks/useLendProvider'
import { ActionTabs, type ActionType } from './ActionTabs'
import { SwapAction } from './SwapAction'
import { useSwap } from '@/hooks/useSwap'
import { useSwapAssets } from '@/hooks/useSwapAssets'
import { actionsApi } from '@/api/actionsApi'
import { useLendBalance } from '@/hooks/useLendBalance'

export interface EarnProps {
  operations: LendProviderOperations
  ready: boolean
  logout: () => Promise<void>
  walletAddress: string | null
  providerConfig: WalletProviderConfig
  getAuthHeaders: () => Promise<{ Authorization: string } | undefined>
  actions?: {
    getSupportedAssets: () => import('@eth-optimism/actions-sdk/react').Asset[]
  }
  logPrefix?: string
}

/**
 * Main Earn component - wraps content with data provider
 */
function Earn({
  operations,
  ready,
  logout,
  walletAddress,
  providerConfig,
  getAuthHeaders,
  actions,
  logPrefix,
}: EarnProps) {
  if (!ready) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <div className="text-center">
          <div className="text-lg" style={{ color: '#666666' }}>
            Loading...
          </div>
        </div>
      </div>
    )
  }

  return (
    <LendProviderContextProvider
      operations={operations}
      ready={ready}
      logPrefix={logPrefix}
    >
      <ActivityHighlightProvider>
        <EarnContent
          logout={logout}
          walletAddress={walletAddress}
          providerConfig={providerConfig}
          getAuthHeaders={getAuthHeaders}
          actions={actions}
          operations={operations}
        />
      </ActivityHighlightProvider>
    </LendProviderContextProvider>
  )
}

interface EarnContentProps {
  logout: () => Promise<void>
  walletAddress: string | null
  providerConfig: WalletProviderConfig
  getAuthHeaders: () => Promise<{ Authorization: string } | undefined>
  actions?: {
    getSupportedAssets: () => import('@eth-optimism/actions-sdk/react').Asset[]
  }
  operations: LendProviderOperations
}

/**
 * Inner content component - consumes context for data
 */
function EarnContent({
  logout,
  walletAddress,
  providerConfig,
  getAuthHeaders,
  actions,
  operations,
}: EarnContentProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<ActionType>('lend')

  const {
    markets,
    selectedMarket,
    handleMarketSelect,
    isLoadingMarkets,
    marketPositions,
    assetBalance,
    isLoadingBalance,
    isMintingAsset,
    depositedAmount,
    isInitialLoad,
    handleMintAsset,
    handleTransaction,
  } = useLendProviderContext()

  // Lend balance tracking (interest calculation)
  const { recordTransaction, getInterest } = useLendBalance(
    providerConfig.queryParam,
  )

  // Wrap handleTransaction to also record to the lend balance ledger
  const handleTransactionWithTracking = useCallback(
    async (mode: 'lend' | 'withdraw', amount: number) => {
      const result = await handleTransaction(mode, amount)
      if (selectedMarket?.marketId) {
        recordTransaction(
          selectedMarket.marketId,
          mode === 'lend' ? 'deposit' : 'withdraw',
          amount,
        )
      }
      return result
    },
    [handleTransaction, recordTransaction, selectedMarket?.marketId],
  )

  // Swap functionality
  const { isExecuting: isSwapping } = useSwap()

  const handleSwap = useCallback(
    async ({
      amountIn,
      tokenInAddress,
      tokenOutAddress,
      chainId,
    }: {
      amountIn: number
      tokenInAddress: Address
      tokenOutAddress: Address
      chainId: SupportedChainId
    }) => {
      const headers = await getAuthHeaders()
      const result = await actionsApi.executeSwap(
        {
          amountIn,
          tokenInAddress,
          tokenOutAddress,
          chainId,
        },
        headers,
      )
      return {
        blockExplorerUrl: result.blockExplorerUrls?.[0],
      }
    },
    [getAuthHeaders],
  )

  const handleGetPrice = useCallback(
    async ({
      tokenInAddress,
      tokenOutAddress,
      chainId,
      amountIn,
    }: {
      tokenInAddress: Address
      tokenOutAddress: Address
      chainId: SupportedChainId
      amountIn?: number
    }) => {
      try {
        const headers = await getAuthHeaders()
        const price = await actionsApi.getSwapPrice(
          {
            tokenInAddress,
            tokenOutAddress,
            chainId,
            amountIn,
          },
          headers,
        )
        return {
          price: price.price,
          priceImpact: price.priceImpact,
          amountOutFormatted: price.amountOutFormatted,
        }
      } catch {
        return null
      }
    },
    [getAuthHeaders],
  )

  // Get token balances fetcher from operations
  const getTokenBalances = useCallback(async () => {
    return operations.getTokenBalances()
  }, [operations])

  // Fetch swap assets using shared hook
  const {
    assets: swapAssets,
    isLoading: isLoadingSwapAssets,
    refetch: refetchSwapAssets,
  } = useSwapAssets({
    actions,
    getAuthHeaders,
    getTokenBalances,
    enabled: activeTab === 'swap',
  })

  // Refetch swap assets when switching to swap tab
  useEffect(() => {
    if (activeTab === 'swap') {
      refetchSwapAssets()
    }
  }, [activeTab, refetchSwapAssets])

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <header
        className="w-full"
        style={{
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #E0E2EB',
        }}
      >
        <div className="w-full px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/Optimism.svg" alt="Optimism" className="h-4" />
            </div>
            <div className="flex items-center gap-4">
              <WalletProviderDropdown
                selectedProvider={providerConfig}
                walletAddress={walletAddress}
                onProviderSelect={async (config) => {
                  await logout()
                  window.location.href = `/earn?walletProvider=${config.queryParam}`
                }}
                onLogout={logout}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-col lg:flex-row min-h-[calc(100vh-65px)]">
        {/* Left Content Area */}
        <div className="flex-1 flex flex-col items-center p-8 overflow-y-auto">
          <div className="w-full max-w-2xl">
            {/* Title Section */}
            <div className="mb-8 text-left">
              <div className="flex items-center gap-2 mb-2">
                <h1
                  style={{
                    color: '#1a1b1e',
                    fontSize: '24px',
                    fontStyle: 'normal',
                    fontWeight: 600,
                  }}
                  className="sm:text-2xl"
                >
                  Actions Demo
                </h1>
                <span
                  className="px-2 py-2 text-xs font-medium rounded-sm"
                  style={{
                    backgroundColor: '#F2F3F8',
                    color: '#404454',
                    fontSize: '14px',
                    fontWeight: 400,
                  }}
                >
                  Sandbox
                </span>
              </div>
              <p
                style={{ color: '#666666', fontSize: '16px' }}
                className="sm:text-base"
              >
                {activeTab === 'lend'
                  ? 'Earn interest by lending USDC'
                  : activeTab === 'swap'
                    ? 'Swap between tokens'
                    : 'Perform onchain actions'}
              </p>
            </div>

            <div className="space-y-6">
              {/* Action Tabs */}
              <ActionTabs activeTab={activeTab} onTabChange={setActiveTab} />

              {activeTab === 'lend' && (
                <>
                  {/* Market Selector */}
                  <div>
                    <h3
                      className="mb-3"
                      style={{
                        color: '#1a1b1e',
                        fontSize: '16px',
                        fontWeight: 600,
                      }}
                    >
                      Select Market
                    </h3>
                    <MarketSelector
                      markets={markets}
                      selectedMarket={
                        selectedMarket
                          ? {
                              name: selectedMarket.marketName,
                              logo: selectedMarket.marketLogo,
                              networkName: selectedMarket.networkName,
                              networkLogo: selectedMarket.networkLogo,
                              asset: selectedMarket.asset,
                              assetLogo: selectedMarket.assetLogo,
                              apy: selectedMarket.apy,
                              isLoadingApy: selectedMarket.isLoadingApy,
                              marketId: selectedMarket.marketId,
                              provider: selectedMarket.provider,
                            }
                          : null
                      }
                      onMarketSelect={handleMarketSelect}
                      isLoading={isLoadingMarkets}
                    />
                  </div>

                  <Action
                    assetBalance={assetBalance}
                    isLoadingBalance={isLoadingBalance}
                    isMintingAsset={isMintingAsset}
                    depositedAmount={depositedAmount}
                    assetSymbol={
                      selectedMarket?.asset.metadata.symbol || 'USDC'
                    }
                    assetLogo={selectedMarket?.assetLogo || '/usdc-logo.svg'}
                    onMintAsset={handleMintAsset}
                    onTransaction={handleTransactionWithTracking}
                    marketId={selectedMarket?.marketId}
                    provider={selectedMarket?.provider}
                  />

                  <LentBalance
                    marketPositions={marketPositions}
                    isInitialLoad={isInitialLoad}
                    getInterest={getInterest}
                  />
                </>
              )}

              {activeTab === 'swap' && (
                <SwapAction
                  assets={swapAssets}
                  isLoadingBalances={isLoadingSwapAssets}
                  onSwap={handleSwap}
                  onGetPrice={handleGetPrice}
                  isExecuting={isSwapping}
                />
              )}

              {/* Activity Log - Mobile */}
              <div className="lg:hidden">
                <ActivityLog />
              </div>

              {/* Info - Mobile */}
              <div className="lg:hidden">
                <div
                  className="p-6"
                  style={{
                    border: '1px solid #E0E2EB',
                    borderRadius: '24px',
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <Info />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Log - Desktop Sidebar */}
        <div
          className="hidden lg:h-[calc(100vh-65px)] lg:block transition-all duration-300 ease-in-out"
          style={{ width: isSidebarCollapsed ? '0px' : '436px' }}
        >
          <ActivityLog onCollapsedChange={setIsSidebarCollapsed} />
        </div>
      </main>
    </div>
  )
}

export default Earn

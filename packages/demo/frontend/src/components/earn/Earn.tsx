import { useState, useCallback, useEffect } from 'react'
import type { Address } from 'viem'
import type { SupportedChainId } from '@eth-optimism/actions-sdk/react'
import { Action } from './Action'
import LentBalance from './LentBalance'
import ActivityLog from './ActivityLog'
import { WalletProviderDropdown } from './WalletProviderDropdown'
import type { WalletProviderConfig } from '@/constants/walletProviders'
import { ActivityHighlightProvider } from '@/contexts/ActivityHighlightContext'
import { ActivityLogProvider } from '@/providers/ActivityLogProvider'
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
import { useActivityLogger } from '@/hooks/useActivityLogger'
import { TotalBalanceDropdown } from './TotalBalanceDropdown'
import { useTotalBalance } from '@/hooks/useTotalBalance'

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
    <ActivityLogProvider
      walletProvider={providerConfig.queryParam}
      walletAddress={walletAddress}
    >
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
    </ActivityLogProvider>
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
  const { recordTransaction, getInterest, seedMarkets } = useLendBalance(
    providerConfig.queryParam,
  )

  // Seed ledger for existing positions that have no tracking history
  useEffect(() => {
    if (marketPositions.length > 0) {
      seedMarkets(
        marketPositions.map((p) => ({
          marketId: p.marketId,
          balance: parseFloat(p.depositedAmount || '0'),
        })),
      )
    }
  }, [marketPositions, seedMarkets])

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

  // Activity logger for swap
  const { logActivity } = useActivityLogger()

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

  // Fetch swap assets (always enabled for navbar balance)
  const {
    assets: swapAssets,
    isLoading: isLoadingSwapAssets,
    refetch: refetchSwapAssets,
  } = useSwapAssets({
    actions,
    getAuthHeaders,
    getTokenBalances,
    enabled: true,
  })

  // Refetch swap assets when switching to swap tab or when balances change
  useEffect(() => {
    if (activeTab === 'swap') {
      refetchSwapAssets()
    }
  }, [activeTab, refetchSwapAssets])

  useEffect(() => {
    refetchSwapAssets()
  }, [assetBalance, refetchSwapAssets])

  // Total balance for navbar dropdown
  const {
    tokenBalances,
    totalUsd,
    isLoading: isLoadingTotalBalance,
  } = useTotalBalance({
    assets: swapAssets,
    getPrice: handleGetPrice,
  })

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
        <div className="w-full px-8">
          <div
            className="flex items-center justify-between"
            style={{ height: '56px' }}
          >
            <div className="flex items-center gap-8" style={{ height: '100%' }}>
              <img src="/Optimism.svg" alt="Optimism" className="h-4" />
              <ActionTabs activeTab={activeTab} onTabChange={setActiveTab} />
            </div>
            <div className="flex items-center gap-4">
              <TotalBalanceDropdown
                totalUsd={totalUsd}
                tokenBalances={tokenBalances}
                isLoading={isLoadingTotalBalance}
              />
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
            <div className="space-y-6">
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
                  onLogActivity={logActivity}
                />
              )}

              {/* Activity Log - Mobile */}
              <div className="lg:hidden">
                <ActivityLog />
              </div>
            </div>
          </div>
        </div>

        {/* Activity Log - Desktop Sidebar */}
        <div
          className="hidden lg:h-[calc(100vh-65px)] lg:block"
          style={{
            width: isSidebarCollapsed ? '0px' : '436px',
            transition: 'width 300ms ease-in-out',
            overflow: 'visible',
          }}
        >
          <ActivityLog onCollapsedChange={setIsSidebarCollapsed} />
        </div>
      </main>
    </div>
  )
}

export default Earn

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
import { useLendBalance } from '@/hooks/useLendBalance'
import { useActivityLogger } from '@/hooks/useActivityLogger'
import { useEarnSwap } from '@/hooks/useEarnSwap'
import { TotalBalanceDropdown } from './TotalBalanceDropdown'

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
  const queryClient = useQueryClient()
  const prevWalletRef = useRef(walletAddress)

  // Clear stale query cache when wallet address changes (logout → re-login)
  useEffect(() => {
    if (prevWalletRef.current !== walletAddress) {
      prevWalletRef.current = walletAddress
      queryClient.clear()
    }
  }, [walletAddress, queryClient])

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Auto-close mobile menu when resizing to desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = () => {
      if (mq.matches) setMobileMenuOpen(false)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

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
    walletAddress,
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
  const {
    swapAssets,
    isLoadingSwapAssets,
    isSwapping,
    handleSwap,
    handleGetPrice,
    tokenBalances,
    totalUsd,
    isLoadingTotalBalance,
  } = useEarnSwap({
    getAuthHeaders,
    actions,
    operations,
    activeTab,
    assetBalance,
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
          position: 'relative',
          zIndex: 40,
        }}
      >
        <div className="w-full px-4 md:px-8">
          <div
            className="flex items-center justify-between"
            style={{ height: '56px' }}
          >
            <div className="flex items-center gap-8" style={{ height: '100%' }}>
              <img src="/Optimism.svg" alt="Optimism" className="h-4" />
              <div className="hidden md:flex" style={{ height: '100%' }}>
                <ActionTabs activeTab={activeTab} onTabChange={setActiveTab} />
              </div>
            </div>
            <div className="hidden md:flex items-center gap-4">
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
            {/* Mobile hamburger */}
            <button
              className="md:hidden flex items-center justify-center"
              style={{
                width: '40px',
                height: '40px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
              }}
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1a1b1e"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1a1b1e"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu - fullscreen overlay with blur */}
        {mobileMenuOpen && (
          <div
            className="md:hidden"
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 45,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
            }}
          >
            <div style={{ backgroundColor: '#FFFFFF' }}>
              {/* Header row: logo + close */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderBottom: '1px solid #E0E2EB',
                }}
              >
                <img
                  src="/Optimism.svg"
                  alt="Optimism"
                  style={{ height: '16px' }}
                />
                <button
                  onClick={() => {
                    setMobileMenuOpen(false)
                  }}
                  style={{
                    width: '40px',
                    height: '40px',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label="Close menu"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1a1b1e"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Nav items */}
              <div style={{ padding: '8px 0' }}>
                {(['lend', 'swap'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab)
                      setMobileMenuOpen(false)
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '16px 24px',
                      border: 'none',
                      backgroundColor: 'transparent',
                      fontSize: '20px',
                      fontWeight: activeTab === tab ? 600 : 400,
                      color: activeTab === tab ? '#1a1b1e' : '#9195A6',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontFamily: 'Inter',
                    }}
                  >
                    {tab === 'lend' ? 'Lend' : 'Swap'}
                  </button>
                ))}
              </div>

              {/* Balance + Wallet pills */}
              <div
                style={{
                  padding: '8px 24px 20px',
                  display: 'flex',
                  gap: '12px',
                }}
              >
                <div style={{ flex: 1, display: 'flex' }}>
                  <TotalBalanceDropdown
                    totalUsd={totalUsd}
                    tokenBalances={tokenBalances}
                    isLoading={isLoadingTotalBalance}
                    fullWidth
                  />
                </div>
                <div style={{ flex: 1, display: 'flex' }}>
                  <WalletProviderDropdown
                    selectedProvider={providerConfig}
                    walletAddress={walletAddress}
                    onProviderSelect={async (config) => {
                      await logout()
                      window.location.href = `/earn?walletProvider=${config.queryParam}`
                    }}
                    onLogout={logout}
                    fullWidth
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="flex flex-col lg:flex-row min-h-[calc(100vh-65px)] overflow-x-hidden">
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
            overflow: 'hidden',
          }}
        >
          <ActivityLog onCollapsedChange={setIsSidebarCollapsed} />
        </div>
      </main>
    </div>
  )
}

export default Earn

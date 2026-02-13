import { useState, useCallback, useEffect } from 'react'
import type { Address } from 'viem'
import type { SupportedChainId } from '@eth-optimism/actions-sdk/react'
import { Action } from './Action'
import LentBalance from './LentBalance'
import ActivityLog from './ActivityLog'
import { WalletProviderDropdown } from './WalletProviderDropdown'
import {
  WALLET_PROVIDER_CONFIGS,
  type WalletProviderConfig,
} from '@/constants/walletProviders'
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
import { OP_DEMO, USDC_DEMO } from '@/constants/markets'
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileExpandedSection, setMobileExpandedSection] = useState<
    'balance' | 'wallet' | null
  >(null)

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

  const handleGetPrice = useCallback(
    async ({
      tokenInAddress,
      tokenOutAddress,
      chainId,
      amountIn,
      amountOut,
    }: {
      tokenInAddress: Address
      tokenOutAddress: Address
      chainId: SupportedChainId
      amountIn?: number
      amountOut?: number
    }) => {
      try {
        const headers = await getAuthHeaders()
        const price = await actionsApi.getSwapPrice(
          {
            tokenInAddress,
            tokenOutAddress,
            chainId,
            amountIn,
            amountOut,
          },
          headers,
        )
        return {
          price: price.price,
          priceImpact: price.priceImpact,
          amountInFormatted: price.amountInFormatted,
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
    marketAllowlist: [USDC_DEMO, OP_DEMO],
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

  const handleSwap = useCallback(
    async ({
      amountIn,
      assetIn,
      assetOut,
      chainId,
    }: {
      amountIn: number
      assetIn: import('@eth-optimism/actions-sdk/react').Asset
      assetOut: import('@eth-optimism/actions-sdk/react').Asset
      chainId: SupportedChainId
    }) => {
      const result = await operations.executeSwap({
        amountIn,
        assetIn,
        assetOut,
        chainId,
      })
      // Refetch immediately, then again after a short delay for RPC propagation
      refetchSwapAssets()
      setTimeout(() => refetchSwapAssets(), 2000)
      return result
    },
    [operations, refetchSwapAssets],
  )

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
              onClick={() => {
                setMobileMenuOpen((o) => !o)
                setMobileExpandedSection(null)
              }}
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

        {/* Mobile menu - overlay style to avoid whitespace */}
        {mobileMenuOpen && (
          <div
            className="md:hidden"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: '57px',
              zIndex: 40,
              backgroundColor: '#FFFFFF',
              borderBottom: '1px solid #E0E2EB',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
            }}
          >
            {/* Stacked nav items */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {[
                { id: 'lend' as const, label: 'Lend' },
                { id: 'swap' as const, label: 'Swap' },
                { id: 'balance' as const, label: 'Balance' },
                { id: 'wallet' as const, label: 'Wallet' },
              ].map((item) => {
                const isActive =
                  item.id === 'lend' || item.id === 'swap'
                    ? activeTab === item.id
                    : mobileExpandedSection === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (item.id === 'lend' || item.id === 'swap') {
                        setActiveTab(item.id)
                        setMobileExpandedSection(null)
                        setMobileMenuOpen(false)
                      } else {
                        setMobileExpandedSection(
                          mobileExpandedSection === item.id ? null : item.id,
                        )
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      border: 'none',
                      borderBottom: '1px solid #F3F4F6',
                      backgroundColor: isActive ? '#F9FAFB' : 'transparent',
                      fontSize: '18px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? '#1a1b1e' : '#9195A6',
                      cursor: 'pointer',
                      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                      textAlign: 'center',
                    }}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>

            {/* Expanded Balance section */}
            {mobileExpandedSection === 'balance' && (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#F9FAFB',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    color: '#9195A6',
                    marginBottom: '8px',
                    fontFamily: 'Inter',
                  }}
                >
                  Total:{' '}
                  {isLoadingTotalBalance ? '...' : `$${totalUsd.toFixed(2)}`}
                </div>
                {tokenBalances.map((token) => (
                  <div
                    key={token.symbol}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 0',
                      borderBottom: '1px solid #F3F4F6',
                      fontFamily: 'Inter',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <img
                        src={token.logo}
                        alt={token.symbol}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                        }}
                      />
                      <span
                        style={{
                          fontSize: '16px',
                          fontWeight: 500,
                          color: '#1a1b1e',
                        }}
                      >
                        {token.balance.toFixed(4)} {token.symbol}
                      </span>
                    </div>
                    <span style={{ fontSize: '16px', color: '#666666' }}>
                      ${token.usdValue.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Expanded Wallet section */}
            {mobileExpandedSection === 'wallet' && (
              <div
                style={{
                  padding: '16px',
                  backgroundColor: '#F9FAFB',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    color: '#9195A6',
                    marginBottom: '12px',
                    fontFamily: 'Inter',
                  }}
                >
                  Wallet Provider
                </div>
                {Object.values(WALLET_PROVIDER_CONFIGS).map((p) => {
                  const isSelected = providerConfig.name === p.name
                  return (
                    <button
                      key={p.name}
                      onClick={async () => {
                        if (!isSelected) {
                          await logout()
                          window.location.href = `/earn?walletProvider=${p.queryParam}`
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        width: '100%',
                        padding: '12px 0',
                        border: 'none',
                        backgroundColor: 'transparent',
                        cursor: isSelected ? 'default' : 'pointer',
                        fontFamily: 'Inter',
                        borderBottom: '1px solid #F3F4F6',
                      }}
                    >
                      <img
                        src={p.logoSrc}
                        alt={p.name}
                        style={{ height: '20px' }}
                      />
                      <span
                        style={{
                          fontSize: '16px',
                          fontWeight: isSelected ? 600 : 400,
                          color: '#1a1b1e',
                        }}
                      >
                        {p.name}
                      </span>
                      {isSelected && (
                        <span style={{ color: '#22C55E', fontSize: '14px' }}>
                          Active
                        </span>
                      )}
                    </button>
                  )
                })}
                {walletAddress && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '8px 0',
                      fontSize: '13px',
                      color: '#9195A6',
                      fontFamily: 'monospace',
                    }}
                  >
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </div>
                )}
                <button
                  onClick={async () => {
                    setMobileMenuOpen(false)
                    await logout()
                  }}
                  style={{
                    width: '100%',
                    marginTop: '8px',
                    padding: '10px',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#F2F3F8',
                    color: '#404454',
                    fontSize: '15px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'Inter',
                  }}
                >
                  Logout
                </button>
              </div>
            )}
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

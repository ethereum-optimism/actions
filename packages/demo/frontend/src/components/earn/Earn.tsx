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
import type { EarnOperations } from '@/hooks/useLendProvider'
import { ActionTabs, type ActionType } from './ActionTabs'
import { SwapAction } from './SwapAction'
import { useLendBalance } from '@/hooks/useLendBalance'
import { useActivityLogger } from '@/hooks/useActivityLogger'
import { useSwap } from '@/hooks/useSwap'
import { TotalBalanceDropdown } from './TotalBalanceDropdown'
import type { TokenBalanceRow } from '@/hooks/useTotalBalance'

// --- Icons ---

function HamburgerIcon() {
  return (
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
  )
}

function CloseIcon() {
  return (
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
  )
}

// --- Mobile Menu ---

function MobileMenu({
  activeTab,
  onTabChange,
  onClose,
  totalUsd,
  tokenBalances,
  isLoadingTotalBalance,
  providerConfig,
  walletAddress,
  onLogout,
}: {
  activeTab: ActionType
  onTabChange: (tab: ActionType) => void
  onClose: () => void
  totalUsd: number
  tokenBalances: TokenBalanceRow[]
  isLoadingTotalBalance: boolean
  providerConfig: WalletProviderConfig
  walletAddress: string | null
  onLogout: () => Promise<void>
}) {
  return (
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid #E0E2EB',
          }}
        >
          <img src="/Optimism.svg" alt="Optimism" style={{ height: '16px' }} />
          <button
            onClick={onClose}
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
            <CloseIcon />
          </button>
        </div>

        <div style={{ padding: '8px 0' }}>
          {(['lend', 'swap'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                onTabChange(tab)
                onClose()
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

        <div style={{ padding: '8px 24px 20px', display: 'flex', gap: '12px' }}>
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
                await onLogout()
                window.location.href = `/earn?walletProvider=${config.queryParam}`
              }}
              onLogout={onLogout}
              fullWidth
            />
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Header ---

function EarnHeader({
  activeTab,
  onTabChange,
  mobileMenuOpen,
  onToggleMobileMenu,
  totalUsd,
  tokenBalances,
  isLoadingTotalBalance,
  providerConfig,
  walletAddress,
  onLogout,
}: {
  activeTab: ActionType
  onTabChange: (tab: ActionType) => void
  mobileMenuOpen: boolean
  onToggleMobileMenu: () => void
  totalUsd: number
  tokenBalances: TokenBalanceRow[]
  isLoadingTotalBalance: boolean
  providerConfig: WalletProviderConfig
  walletAddress: string | null
  onLogout: () => Promise<void>
}) {
  return (
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
              <ActionTabs activeTab={activeTab} onTabChange={onTabChange} />
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
                await onLogout()
                window.location.href = `/earn?walletProvider=${config.queryParam}`
              }}
              onLogout={onLogout}
            />
          </div>
          <button
            className="md:hidden flex items-center justify-center"
            style={{
              width: '40px',
              height: '40px',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
            }}
            onClick={onToggleMobileMenu}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <CloseIcon /> : <HamburgerIcon />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <MobileMenu
          activeTab={activeTab}
          onTabChange={onTabChange}
          onClose={onToggleMobileMenu}
          totalUsd={totalUsd}
          tokenBalances={tokenBalances}
          isLoadingTotalBalance={isLoadingTotalBalance}
          providerConfig={providerConfig}
          walletAddress={walletAddress}
          onLogout={onLogout}
        />
      )}
    </header>
  )
}

// --- Lend Tab ---

function LendTab({
  handleTransactionWithTracking,
  getInterest,
}: {
  handleTransactionWithTracking: (
    mode: 'lend' | 'withdraw',
    amount: number,
  ) => Promise<{ transactionHash?: string; blockExplorerUrl?: string }>
  getInterest?: (
    marketId: { address: string; chainId: number },
    currentBalance: number,
  ) => number
}) {
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
    isLoadingPosition,
    handleMintAsset,
  } = useLendProviderContext()

  return (
    <>
      <div>
        <h3
          className="mb-3"
          style={{ color: '#1a1b1e', fontSize: '16px', fontWeight: 600 }}
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
        assetSymbol={selectedMarket?.asset.metadata.symbol || 'USDC'}
        onMintAsset={handleMintAsset}
        onTransaction={handleTransactionWithTracking}
        marketId={selectedMarket?.marketId}
        provider={selectedMarket?.provider}
      />

      <LentBalance
        marketPositions={marketPositions}
        isInitialLoad={isInitialLoad}
        isLoadingPosition={isLoadingPosition}
        currentDepositedAmount={depositedAmount}
        selectedMarketId={selectedMarket?.marketId}
        getInterest={getInterest}
      />
    </>
  )
}

// --- Main Earn ---

export interface EarnProps {
  operations: EarnOperations
  ready: boolean
  logout: () => Promise<void>
  walletAddress: string | null
  providerConfig: WalletProviderConfig
  logPrefix?: string
}

function Earn({
  operations,
  ready,
  logout,
  walletAddress,
  providerConfig,
  logPrefix,
}: EarnProps) {
  const queryClient = useQueryClient()
  const prevWalletRef = useRef(walletAddress)

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
        <div className="text-lg" style={{ color: '#666666' }}>
          Loading...
        </div>
      </div>
    )
  }

  return (
    <ActivityLogProvider walletProvider={providerConfig.queryParam}>
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
  operations: EarnOperations
}

function EarnContent({
  logout,
  walletAddress,
  providerConfig,
  operations,
}: EarnContentProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<ActionType>('lend')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = () => {
      if (mq.matches) setMobileMenuOpen(false)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const { selectedMarket, marketPositions, handleTransaction } =
    useLendProviderContext()

  const { recordTransaction, getInterest, seedMarkets } = useLendBalance(
    providerConfig.queryParam,
    walletAddress,
  )

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

  const { logActivity } = useActivityLogger()

  const {
    swapAssets,
    isLoadingSwapAssets,
    isSwapping,
    handleSwap,
    handleGetPrice,
    tokenBalances,
    totalUsd,
    isLoadingTotalBalance,
  } = useSwap({ operations, activeTab })

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <EarnHeader
        activeTab={activeTab}
        onTabChange={setActiveTab}
        mobileMenuOpen={mobileMenuOpen}
        onToggleMobileMenu={() => setMobileMenuOpen((o) => !o)}
        totalUsd={totalUsd}
        tokenBalances={tokenBalances}
        isLoadingTotalBalance={isLoadingTotalBalance}
        providerConfig={providerConfig}
        walletAddress={walletAddress}
        onLogout={logout}
      />

      <main className="flex flex-col lg:flex-row min-h-[calc(100vh-65px)] overflow-x-hidden">
        <div className="flex-1 flex flex-col items-center p-8 overflow-y-auto">
          <div className="w-full max-w-2xl">
            <div className="space-y-6">
              {activeTab === 'lend' && (
                <LendTab
                  handleTransactionWithTracking={handleTransactionWithTracking}
                  getInterest={getInterest}
                />
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

              <div className="lg:hidden">
                <ActivityLog />
              </div>
            </div>
          </div>
        </div>

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

import { useState } from 'react'
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

export interface EarnProps {
  operations: LendProviderOperations
  ready: boolean
  logout: () => Promise<void>
  walletAddress: string | null
  providerConfig: WalletProviderConfig
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
        />
      </ActivityHighlightProvider>
    </LendProviderContextProvider>
  )
}

interface EarnContentProps {
  logout: () => Promise<void>
  walletAddress: string | null
  providerConfig: WalletProviderConfig
}

/**
 * Inner content component - consumes context for data
 */
function EarnContent({
  logout,
  walletAddress,
  providerConfig,
}: EarnContentProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const {
    markets,
    selectedMarket,
    handleMarketSelect,
    isLoadingMarkets,
    marketPositions,
    assetBalance,
    isLoadingBalance,
    depositedAmount,
    isInitialLoad,
    handleMintAsset,
    handleTransaction,
  } = useLendProviderContext()

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
                Earn interest by lending USDC
              </p>
            </div>

            <div className="space-y-6">
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
                depositedAmount={depositedAmount}
                assetSymbol={selectedMarket?.asset.metadata.symbol || 'USDC'}
                assetLogo={selectedMarket?.assetLogo || '/usdc-logo.svg'}
                onMintAsset={handleMintAsset}
                onTransaction={handleTransaction}
                marketId={selectedMarket?.marketId}
                provider={selectedMarket?.provider}
              />

              <LentBalance
                marketPositions={marketPositions}
                isInitialLoad={isInitialLoad}
              />

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

import { Action } from './Action'
import LentBalance from './LentBalance'
import ActivityLog from './ActivityLog'
import { WalletProviderDropdown } from './WalletProviderDropdown'
import type { WalletProviderConfig } from '@/constants/walletProviders'
export interface EarnContentProps {
  ready: boolean
  logout: () => Promise<void>
  walletAddress: string | null
  usdcBalance: string
  isLoadingBalance: boolean
  apy: number | null
  isLoadingApy: boolean
  depositedAmount: string | null
  isLoadingPosition: boolean
  isInitialLoad: boolean
  selectedProviderConfig: WalletProviderConfig
  onMintUSDC: () => void
  onTransaction: (
    mode: 'lend' | 'withdraw',
    amount: number,
  ) => Promise<{
    transactionHash?: string
    blockExplorerUrl?: string
  }>
}

/**
 * Presentational component for the Earn page
 * Handles layout and user dropdown - all business logic delegated to container
 */
function Earn({
  ready,
  logout,
  walletAddress,
  usdcBalance,
  isLoadingBalance,
  selectedProviderConfig,
  apy,
  isLoadingApy,
  depositedAmount,
  isLoadingPosition,
  isInitialLoad,
  onMintUSDC,
  onTransaction,
}: EarnContentProps) {
  // Show loading state while Privy is initializing
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
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Custom Header */}
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
                selectedProvider={selectedProviderConfig}
                walletAddress={walletAddress}
                onProviderSelect={async (providerConfig) => {
                  await logout()
                  window.location.href = `/earn?walletProvider=${providerConfig.queryParam}`
                }}
              />
            </div>
          </div>
        </div>
      </header>

      <main className="flex" style={{ height: 'calc(100vh - 65px)' }}>
        {/* Left Content Area */}
        <div
          className="flex-1 flex flex-col items-center p-8 overflow-y-auto"
          style={{ maxWidth: 'calc(100% - 436px)' }}
        >
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
                style={{
                  color: '#666666',
                  fontSize: '16px',
                }}
              >
                Earn interest by lending USDC
              </p>
            </div>

            <div className="space-y-6">
              <LentBalance
                depositedAmount={depositedAmount}
                apy={apy}
                isLoadingPosition={isLoadingPosition}
                isLoadingApy={isLoadingApy}
                isInitialLoad={isInitialLoad}
              />
              <Action
                usdcBalance={usdcBalance}
                isLoadingBalance={isLoadingBalance}
                apy={apy}
                isLoadingApy={isLoadingApy}
                depositedAmount={depositedAmount}
                onMintUSDC={onMintUSDC}
                onTransaction={onTransaction}
              />
            </div>
          </div>
        </div>

        {/* Activity Log - Right Side */}
        <div style={{ width: '436px' }}>
          <ActivityLog />
        </div>
      </main>
    </div>
  )
}

export default Earn

import { useSearchParams } from 'react-router-dom'
import { PrivyProvider } from '../providers/PrivyProvider'
import { ActivityLogProvider } from '../providers/ActivityLogProvider'
import { DynamicProvider } from '@/providers/DynamicProvider'
import { EarnWithDynamicWallet } from '@/components/EarnWithDynamicWallet'
import { EarnWithPrivyServerWallet } from '@/components/EarnWithPrivyServerWallet'
import {
  WALLET_PROVIDERS,
  DEFAULT_WALLET_PROVIDER,
} from '@/constants/walletProviders'

/**
 * Earn page that renders different wallet provider implementations
 * based on the ?walletProvider query parameter
 */
export function EarnPage() {
  const [searchParams] = useSearchParams()
  const walletProvider =
    searchParams.get('walletProvider') || DEFAULT_WALLET_PROVIDER

  if (walletProvider === WALLET_PROVIDERS.PRIVY) {
    return (
      <PrivyProvider>
        <ActivityLogProvider>
          <EarnWithPrivyServerWallet />
        </ActivityLogProvider>
      </PrivyProvider>
    )
  }

  if (walletProvider === WALLET_PROVIDERS.DYNAMIC) {
    return (
      <DynamicProvider>
        <ActivityLogProvider>
          <EarnWithDynamicWallet />
        </ActivityLogProvider>
      </DynamicProvider>
    )
  }

  // Fallback for unsupported providers
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      <div className="text-center">
        <h1
          className="text-2xl font-semibold mb-2"
          style={{ color: '#1a1b1e' }}
        >
          Unsupported Wallet Provider
        </h1>
        <p style={{ color: '#666666' }}>
          Provider "{walletProvider}" is not yet supported.
        </p>
      </div>
    </div>
  )
}

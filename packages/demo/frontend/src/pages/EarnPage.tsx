import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ActivityLogProvider } from '../providers/ActivityLogProvider'
import { WALLET_PROVIDERS } from '@/constants/walletProviders'
import { WelcomeWalletPicker } from '@/components/earn/WelcomeWalletPicker'

// Lazy load wallet providers to reduce bundle size and build memory
const PrivyProvider = lazy(() =>
  import('../providers/PrivyProvider').then((m) => ({
    default: m.PrivyProvider,
  })),
)
const DynamicProvider = lazy(() =>
  import('@/providers/DynamicProvider').then((m) => ({
    default: m.DynamicProvider,
  })),
)
const TurnkeyProvider = lazy(() =>
  import('../providers/TurnkeyProvider').then((m) => ({
    default: m.TurnkeyProvider,
  })),
)

// Lazy load wallet-specific components
const EarnWithPrivyServerWallet = lazy(() =>
  import('@/components/earn/EarnWithPrivyServerWallet').then((m) => ({
    default: m.EarnWithPrivyServerWallet,
  })),
)
const EarnWithDynamicWallet = lazy(() =>
  import('@/components/earn/EarnWithDynamicWallet').then((m) => ({
    default: m.EarnWithDynamicWallet,
  })),
)
const EarnWithTurnkeyWallet = lazy(() =>
  import('@/components/earn/EarnWithTurnkeyWallet').then((m) => ({
    default: m.EarnWithTurnkeyWallet,
  })),
)

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-white">Loading...</div>
    </div>
  )
}

/**
 * Earn page that renders different wallet provider implementations
 * based on the ?walletProvider query parameter
 */
export function EarnPage() {
  const [searchParams] = useSearchParams()
  const walletProvider = searchParams.get('walletProvider')

  if (walletProvider === WALLET_PROVIDERS.PRIVY) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <PrivyProvider>
          <ActivityLogProvider walletProvider={walletProvider}>
            <EarnWithPrivyServerWallet />
          </ActivityLogProvider>
        </PrivyProvider>
      </Suspense>
    )
  }

  if (walletProvider === WALLET_PROVIDERS.DYNAMIC) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <DynamicProvider>
          <ActivityLogProvider walletProvider={walletProvider}>
            <EarnWithDynamicWallet />
          </ActivityLogProvider>
        </DynamicProvider>
      </Suspense>
    )
  }

  if (walletProvider === WALLET_PROVIDERS.TURNKEY) {
    return (
      <Suspense fallback={<LoadingFallback />}>
        <TurnkeyProvider>
          <ActivityLogProvider walletProvider={walletProvider}>
            <EarnWithTurnkeyWallet />
          </ActivityLogProvider>
        </TurnkeyProvider>
      </Suspense>
    )
  }

  return <WelcomeWalletPicker />
}

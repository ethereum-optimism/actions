import { useSearchParams } from 'react-router-dom'
import { PrivyProvider } from '../providers/PrivyProvider'
import { ActivityLogProvider } from '../providers/ActivityLogProvider'
import { DynamicProvider } from '@/providers/DynamicProvider'
import { EarnWithDynamicWallet } from '@/components/EarnWithDynamicWallet'
import { EarnWithTurnkeyWallet } from '@/components/EarnWithTurnkeyWallet'
import { EarnWithPrivyServerWallet } from '@/components/EarnWithPrivyServerWallet'
import { WALLET_PROVIDERS } from '@/constants/walletProviders'
import { TurnkeyProvider } from '../providers/TurnkeyProvider'
import { WelcomeWalletPicker } from '@/components/WelcomeWalletPicker'

/**
 * Earn page that renders different wallet provider implementations
 * based on the ?walletProvider query parameter
 */
export function EarnPage() {
  const [searchParams] = useSearchParams()
  const walletProvider = searchParams.get('walletProvider')

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

  if (walletProvider === WALLET_PROVIDERS.TURNKEY) {
    return (
      <TurnkeyProvider>
        <ActivityLogProvider>
          <EarnWithTurnkeyWallet />
        </ActivityLogProvider>
      </TurnkeyProvider>
    )
  }

  return <WelcomeWalletPicker />
}

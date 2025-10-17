import { useDynamicWallet } from '@/hooks/useDynamicWallet'
import { EarnWithFrontendWallet } from './EarnWithFrontendWallet'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { WALLET_PROVIDER_CONFIGS } from '@/constants/walletProviders'

export function EarnWithDynamicWallet() {
  const { smartWallet } = useDynamicWallet()
  const { handleLogOut } = useDynamicContext()

  return (
    <EarnWithFrontendWallet
      wallet={smartWallet}
      logout={handleLogOut}
      selectedProvider={WALLET_PROVIDER_CONFIGS.dynamic}
    />
  )
}

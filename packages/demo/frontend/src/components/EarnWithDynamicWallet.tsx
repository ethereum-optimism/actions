import { useDynamicWallet } from '@/hooks/useDynamicWallet'
import { EarnWithFrontendWallet } from './EarnWithFrontendWallet'
import { useDynamicContext, useIsLoggedIn } from '@dynamic-labs/sdk-react-core'
import { WALLET_PROVIDER_CONFIGS } from '@/constants/walletProviders'
import { LoginWithDynamic } from './LoginWithDynamic'

export function EarnWithDynamicWallet() {
  const { smartWallet } = useDynamicWallet()
  const { handleLogOut } = useDynamicContext()
  const isLoggedIn = useIsLoggedIn()

  if (!isLoggedIn) {
    return <LoginWithDynamic />
  }

  return (
    <EarnWithFrontendWallet
      wallet={smartWallet}
      logout={handleLogOut}
      selectedProvider={WALLET_PROVIDER_CONFIGS.dynamic}
    />
  )
}

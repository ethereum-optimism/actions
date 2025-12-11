import { useEffect } from 'react'
import { useDynamicWallet } from '@/hooks/useDynamicWallet'
import { EarnWithFrontendWallet } from './EarnWithFrontendWallet'
import { useDynamicContext, useIsLoggedIn } from '@dynamic-labs/sdk-react-core'
import { WALLET_PROVIDERS } from '@/constants/walletProviders'
import { LoginWithDynamic } from './LoginWithDynamic'
import { trackEvent, identifyUser } from '@/utils/analytics'

export function EarnWithDynamicWallet() {
  const { smartWallet } = useDynamicWallet()
  const { handleLogOut, user } = useDynamicContext()
  const isLoggedIn = useIsLoggedIn()

  // Track successful login
  useEffect(() => {
    if (isLoggedIn && user?.userId) {
      identifyUser(user.userId, {
        email: user.email,
        provider: 'dynamic',
      })
      trackEvent('login_success', {
        provider: 'dynamic',
        hasEmail: !!user.email,
      })
    }
  }, [isLoggedIn, user?.userId, user?.email])

  if (!isLoggedIn) {
    return <LoginWithDynamic />
  }

  return (
    <EarnWithFrontendWallet
      wallet={smartWallet}
      logout={handleLogOut}
      selectedProvider={WALLET_PROVIDERS.DYNAMIC}
    />
  )
}

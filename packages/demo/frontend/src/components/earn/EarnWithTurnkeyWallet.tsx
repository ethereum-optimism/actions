import { useEffect } from 'react'
import { AuthState, ClientState, useTurnkey } from '@turnkey/react-wallet-kit'
import { EarnWithFrontendWallet } from './EarnWithFrontendWallet'
import { WALLET_PROVIDERS } from '@/constants/walletProviders'
import { LoginWithTurnkey } from './LoginWithTurnkey'
import { WalletLoadingScreen } from './WalletLoadingScreen'
import { useTurnkeyWallet } from '@/hooks/useTurnkeyWallet'
import { trackEvent, identifyUser } from '@/utils/analytics'

export function EarnWithTurnkeyWallet() {
  const { smartWallet } = useTurnkeyWallet()
  const { clientState, authState, session, user, logout } = useTurnkey()

  const isLoggedIn =
    clientState === ClientState.Ready &&
    authState === AuthState.Authenticated &&
    Boolean(session) &&
    Boolean(user)

  // Track successful login
  useEffect(() => {
    if (isLoggedIn && user) {
      const userId = user.userId || user.userName || 'turnkey-user'
      identifyUser(userId, {
        provider: 'turnkey',
      })
      trackEvent('login_success', {
        provider: 'turnkey',
      })
    }
  }, [isLoggedIn, user])

  const isRestoringSession =
    clientState !== ClientState.Ready ||
    Boolean(session) !== (authState === AuthState.Authenticated)

  if (isRestoringSession || (isLoggedIn && !smartWallet)) {
    return <WalletLoadingScreen />
  }

  if (!isLoggedIn) {
    return <LoginWithTurnkey />
  }

  return (
    <EarnWithFrontendWallet
      wallet={smartWallet}
      logout={logout}
      selectedProvider={WALLET_PROVIDERS.TURNKEY}
    />
  )
}

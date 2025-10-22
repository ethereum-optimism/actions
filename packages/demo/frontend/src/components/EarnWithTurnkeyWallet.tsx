import { AuthState, ClientState, useTurnkey } from '@turnkey/react-wallet-kit'
import { EarnWithFrontendWallet } from './EarnWithFrontendWallet'
import { WALLET_PROVIDERS } from '@/constants/walletProviders'
import { LoginWithTurnkey } from './LoginWithTurnkey'
import { useTurnkeyWallet } from '@/hooks/useTurnkeyWallet'

export function EarnWithTurnkeyWallet() {
  const { smartWallet } = useTurnkeyWallet()
  const { clientState, authState, user, logout } = useTurnkey()

  const isLoggedIn =
    clientState === ClientState.Ready &&
    authState === AuthState.Authenticated &&
    user

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

import { useTurnkey } from '@turnkey/react-wallet-kit'
import { LoginLayout } from './LoginLayout'

/**
 * Login component for Turnkey authentication
 * Displays a simple sign-in screen with the Turnkey login flow
 */
export function LoginWithTurnkey() {
  const { handleLogin } = useTurnkey()

  return <LoginLayout onSignIn={handleLogin} />
}

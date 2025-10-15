import { useLogin } from '@privy-io/react-auth'
import { LoginLayout } from './LoginLayout'

/**
 * Login component for Privy authentication
 * Displays a simple sign-in screen with the Privy login flow
 */
export function LoginWithPrivy() {
  const { login } = useLogin()

  return <LoginLayout onSignIn={login} />
}

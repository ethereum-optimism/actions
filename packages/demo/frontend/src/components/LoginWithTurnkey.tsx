import { useTurnkey, useModal, ClientState } from '@turnkey/react-wallet-kit'
import { useEffect, useRef } from 'react'
import { ROUTES } from '@/constants/routes'

/**
 * Login component for Turnkey authentication
 * Displays a simple sign-in screen with the Turnkey login flow
 */
export function LoginWithTurnkey() {
  const { clientState, handleLogin } = useTurnkey()
  const { modalStack } = useModal()
  const hasTriggeredLogin = useRef(false)
  const hasModalBeenOpened = useRef(false)

  useEffect(() => {
    if (clientState === ClientState.Ready && !hasTriggeredLogin.current) {
      hasTriggeredLogin.current = true
      handleLogin()
    }
  }, [clientState, handleLogin])

  useEffect(() => {
    if (modalStack.length > 0) {
      hasModalBeenOpened.current = true
    }

    if (modalStack.length === 0 && hasModalBeenOpened.current) {
      window.location.href = ROUTES.EARN
    }
  }, [modalStack])

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    ></div>
  )
}

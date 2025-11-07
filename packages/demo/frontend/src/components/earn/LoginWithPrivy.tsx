import { useEffect, useRef, useCallback } from 'react'
import { useLogin, usePrivy } from '@privy-io/react-auth'
import { ROUTES } from '@/constants/routes'

/**
 * Login component for Privy authentication
 * Automatically triggers the Privy login modal on mount
 */
export function LoginWithPrivy() {
  const handleError = useCallback(() => {
    window.location.href = ROUTES.EARN
  }, [])

  const { login } = useLogin({ onError: handleError })
  const { ready } = usePrivy()
  const hasTriggeredLogin = useRef(false)

  useEffect(() => {
    if (ready && !hasTriggeredLogin.current) {
      hasTriggeredLogin.current = true
      login()
    }
  }, [ready, login])

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

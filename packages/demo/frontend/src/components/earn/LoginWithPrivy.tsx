import { useEffect, useRef, useCallback, useState } from 'react'
import { useLogin, usePrivy, type PrivyErrorCode } from '@privy-io/react-auth'
import { ROUTES } from '@/constants/routes'
import { CtaButton } from './CtaButton'

// Friendly copy for the Privy error codes worth explaining to the user.
const ERROR_MESSAGES: Record<string, string> = {
  max_accounts_reached:
    "This demo has reached its Privy user limit, so new accounts can't sign in right now. Try another wallet provider.",
}

const FALLBACK_ERROR_MESSAGE =
  'Something went wrong signing in with Privy. Please try again or choose another wallet provider.'

/**
 * Login component for Privy authentication
 * Automatically triggers the Privy login modal on mount
 */
export function LoginWithPrivy() {
  const [loginError, setLoginError] = useState<PrivyErrorCode | null>(null)

  // Log and surface login failures instead of silently redirecting away.
  const handleError = useCallback((error: PrivyErrorCode) => {
    console.error('[LoginWithPrivy] Privy login failed:', error)
    setLoginError(error)
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
      className="min-h-screen flex items-center justify-center"
      style={{
        backgroundColor: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {loginError && (
        <div className="shadow-none rounded-3xl inline-flex flex-col items-center py-8 px-6 gap-5 border border-[#E0E2EB] w-[361px] text-center">
          <div className="text-2xl font-semibold leading-8 text-black">
            Unable to sign in
          </div>
          <div className="text-base font-normal leading-6 text-[#404454]">
            {ERROR_MESSAGES[loginError] ?? FALLBACK_ERROR_MESSAGE}
          </div>
          <div className="flex flex-col gap-3 w-full">
            <CtaButton
              onClick={() => {
                setLoginError(null)
                login()
              }}
            >
              Try again
            </CtaButton>
            <button
              onClick={() => (window.location.href = ROUTES.EARN)}
              className="w-full py-3 px-4 font-medium rounded-xl border border-[#E0E2EB] text-[#404454] cursor-pointer bg-transparent"
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              }}
            >
              Choose another wallet
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

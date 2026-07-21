import { ClientState, useTurnkey } from '@turnkey/react-wallet-kit'
import { useState } from 'react'
import { ROUTES } from '@/constants/routes'
import { CtaButton } from './CtaButton'

const PASSKEY_ERROR_MESSAGE =
  'Passkey authentication was canceled or is unavailable in this browser. Try again or choose another wallet.'

/**
 * @description Displays explicit Turnkey passkey actions and handles browser rejections.
 * @returns The Turnkey authentication screen.
 */
export function LoginWithTurnkey() {
  const { clientState, loginWithPasskey, signUpWithPasskey } = useTurnkey()
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [hasError, setHasError] = useState(false)
  const isReady = clientState === ClientState.Ready

  const authenticate = async (action: () => Promise<unknown>) => {
    setHasError(false)
    setIsAuthenticating(true)
    try {
      await action()
    } catch {
      setHasError(true)
    } finally {
      setIsAuthenticating(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        backgroundColor: '#FFFFFF',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div className="shadow-none rounded-3xl inline-flex flex-col items-center py-8 px-6 gap-5 border border-[#E0E2EB] w-[361px] text-center">
        <div className="text-2xl font-semibold leading-8 text-black">
          Sign in with Turnkey
        </div>
        <div className="text-base font-normal leading-6 text-[#404454]">
          Use an existing passkey or create one for this device.
        </div>
        {hasError && (
          <div role="alert" className="text-sm leading-5 text-[#B42318]">
            {PASSKEY_ERROR_MESSAGE}
          </div>
        )}
        <div className="flex flex-col gap-3 w-full">
          <CtaButton
            disabled={!isReady || isAuthenticating}
            onClick={() => void authenticate(loginWithPasskey)}
          >
            {isAuthenticating
              ? 'Waiting for passkey...'
              : 'Log in with passkey'}
          </CtaButton>
          <button
            disabled={!isReady || isAuthenticating}
            onClick={() => void authenticate(signUpWithPasskey)}
            className="w-full py-3 px-4 font-medium rounded-xl border border-[#E0E2EB] text-[#404454] cursor-pointer bg-transparent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sign up with passkey
          </button>
          <button
            onClick={() => (window.location.href = ROUTES.EARN)}
            className="w-full py-2 px-4 font-medium text-[#404454] cursor-pointer bg-transparent border-0"
          >
            Choose another wallet
          </button>
        </div>
      </div>
    </div>
  )
}

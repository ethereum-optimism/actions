import { render, screen, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Capture the onError callback Privy would invoke on a failed login.
let capturedOnError: ((code: string) => void) | undefined

vi.mock('@privy-io/react-auth', () => ({
  useLogin: ({ onError }: { onError: (code: string) => void }) => {
    capturedOnError = onError
    return { login: vi.fn() }
  },
  usePrivy: () => ({ ready: true }),
}))

import { LoginWithPrivy } from './LoginWithPrivy'

describe('LoginWithPrivy', () => {
  beforeEach(() => {
    capturedOnError = undefined
  })

  it('logs and surfaces a known Privy error instead of swallowing it', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LoginWithPrivy />)

    act(() => capturedOnError?.('max_accounts_reached'))

    expect(
      screen.getByText(/reached its Privy user limit/i),
    ).toBeInTheDocument()
    expect(errorSpy).toHaveBeenCalledWith(
      '[LoginWithPrivy] Privy login failed:',
      'max_accounts_reached',
    )
    errorSpy.mockRestore()
  })

  it('shows a fallback message for unmapped error codes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LoginWithPrivy />)

    act(() => capturedOnError?.('unknown_auth_error'))

    expect(
      screen.getByText(/Something went wrong signing in with Privy/i),
    ).toBeInTheDocument()
  })
})

import { render, screen, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))

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
    navigate.mockReset()
  })

  it('logs the error code and surfaces the fallback message instead of swallowing it', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LoginWithPrivy />)

    act(() => capturedOnError?.('max_accounts_reached'))

    expect(
      screen.getByText(/Something went wrong signing in with Privy/i),
    ).toBeInTheDocument()
    expect(errorSpy).toHaveBeenCalledWith(
      '[LoginWithPrivy] Privy login failed:',
      'max_accounts_reached',
    )
    expect(navigate).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('does not surface an error when the user exits the auth flow', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<LoginWithPrivy />)

    act(() => capturedOnError?.('exited_auth_flow'))

    expect(
      screen.queryByText(/Something went wrong signing in with Privy/i),
    ).not.toBeInTheDocument()
    expect(navigate).toHaveBeenCalledWith('/earn', { replace: true })
  })
})

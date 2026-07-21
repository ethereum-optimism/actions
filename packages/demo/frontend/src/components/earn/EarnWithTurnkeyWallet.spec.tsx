import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  identifyUser: vi.fn(),
  trackEvent: vi.fn(),
  useTurnkey: vi.fn(),
  useTurnkeyWallet: vi.fn(),
}))

vi.mock('@turnkey/react-wallet-kit', () => ({
  AuthState: {
    Authenticated: 'authenticated',
    Unauthenticated: 'unauthenticated',
  },
  ClientState: { Loading: 'loading', Ready: 'ready' },
  useTurnkey: mocks.useTurnkey,
}))

vi.mock('@/hooks/useTurnkeyWallet', () => ({
  useTurnkeyWallet: mocks.useTurnkeyWallet,
}))

vi.mock('@/utils/analytics', () => ({
  identifyUser: mocks.identifyUser,
  trackEvent: mocks.trackEvent,
}))

vi.mock('./LoginWithTurnkey', () => ({
  LoginWithTurnkey: () => <div>Sign in with Turnkey</div>,
}))

vi.mock('./EarnWithFrontendWallet', () => ({
  EarnWithFrontendWallet: ({ wallet }: { wallet: unknown }) =>
    wallet ? <div>Earn page</div> : <div>Loading...</div>,
}))

import { EarnWithTurnkeyWallet } from './EarnWithTurnkeyWallet'

const logout = vi.fn()
const user = { userId: 'turnkey-user', userName: 'Turnkey User' }
const session = { organizationId: 'organization-id' }

describe('EarnWithTurnkeyWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useTurnkeyWallet.mockReturnValue({ smartWallet: null })
  })

  it('keeps session restoration and wallet creation visually stable', () => {
    mocks.useTurnkey.mockReturnValue({
      authState: 'unauthenticated',
      clientState: 'loading',
      logout,
      session: undefined,
      user: undefined,
    })
    const { rerender } = render(<EarnWithTurnkeyWallet />)

    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    expect(screen.queryByText('Sign in with Turnkey')).not.toBeInTheDocument()

    mocks.useTurnkey.mockReturnValue({
      authState: 'unauthenticated',
      clientState: 'ready',
      logout,
      session,
      user,
    })
    rerender(<EarnWithTurnkeyWallet />)

    expect(screen.queryByText('Sign in with Turnkey')).not.toBeInTheDocument()

    mocks.useTurnkey.mockReturnValue({
      authState: 'authenticated',
      clientState: 'ready',
      logout,
      session,
      user,
    })
    rerender(<EarnWithTurnkeyWallet />)

    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()

    mocks.useTurnkeyWallet.mockReturnValue({ smartWallet: {} })
    rerender(<EarnWithTurnkeyWallet />)

    expect(screen.getByText('Earn page')).toBeInTheDocument()
  })

  it('shows sign-in after an unauthenticated client is ready', () => {
    mocks.useTurnkey.mockReturnValue({
      authState: 'unauthenticated',
      clientState: 'ready',
      logout,
      session: undefined,
      user: undefined,
    })

    render(<EarnWithTurnkeyWallet />)

    expect(screen.getByText('Sign in with Turnkey')).toBeInTheDocument()
  })
})

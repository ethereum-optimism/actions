import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const turnkey = vi.hoisted(() => ({
  handleLogin: vi.fn(),
  loginWithPasskey: vi.fn(),
  signUpWithPasskey: vi.fn(),
}))

vi.mock('@turnkey/react-wallet-kit', () => ({
  ClientState: { Ready: 'ready' },
  useTurnkey: () => ({
    clientState: 'ready',
    handleLogin: turnkey.handleLogin,
    loginWithPasskey: turnkey.loginWithPasskey,
    signUpWithPasskey: turnkey.signUpWithPasskey,
  }),
  useModal: () => ({ modalStack: [] }),
}))

import { LoginWithTurnkey } from './LoginWithTurnkey'

describe('LoginWithTurnkey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    turnkey.handleLogin.mockResolvedValue(undefined)
    turnkey.loginWithPasskey.mockResolvedValue(undefined)
    turnkey.signUpWithPasskey.mockResolvedValue(undefined)
  })

  it('waits for an explicit user action before opening authentication', () => {
    render(<LoginWithTurnkey />)

    expect(turnkey.handleLogin).not.toHaveBeenCalled()
    expect(turnkey.loginWithPasskey).not.toHaveBeenCalled()
    expect(turnkey.signUpWithPasskey).not.toHaveBeenCalled()
  })

  it('logs in with a passkey from the sign-in button', async () => {
    const user = userEvent.setup()
    render(<LoginWithTurnkey />)

    await user.click(
      screen.getByRole('button', { name: 'Log in with passkey' }),
    )

    expect(turnkey.loginWithPasskey).toHaveBeenCalledOnce()
  })

  it('handles a rejected passkey request and offers recovery', async () => {
    const user = userEvent.setup()
    turnkey.loginWithPasskey.mockRejectedValueOnce(
      new DOMException('The request is not allowed', 'NotAllowedError'),
    )
    render(<LoginWithTurnkey />)

    await user.click(
      screen.getByRole('button', { name: 'Log in with passkey' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Passkey authentication was canceled or is unavailable',
    )
    expect(
      screen.getByRole('button', { name: 'Choose another wallet' }),
    ).toBeInTheDocument()
  })
})

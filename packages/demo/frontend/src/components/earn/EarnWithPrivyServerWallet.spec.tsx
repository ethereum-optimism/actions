import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const privyMocks = vi.hoisted(() => ({
  addSessionSigners: vi.fn(),
  walletsReady: false,
}))

vi.mock('@privy-io/react-auth', () => ({
  useIdentityToken: () => ({ identityToken: 'identity-token' }),
  useLogout: () => ({ logout: vi.fn() }),
  usePrivy: () => ({
    authenticated: true,
    getAccessToken: vi.fn(),
    ready: true,
  }),
  useSessionSigners: () => ({
    addSessionSigners: privyMocks.addSessionSigners,
  }),
  useUser: () => ({
    user: {
      id: 'privy-user',
      linkedAccounts: [
        {
          address: '0x0000000000000000000000000000000000000001',
          chainType: 'ethereum',
          delegated: false,
          type: 'wallet',
          walletClientType: 'privy',
        },
      ],
    },
  }),
  useWallets: () => ({ ready: privyMocks.walletsReady, wallets: [] }),
}))

vi.mock('@/envVars', () => ({
  env: { VITE_SESSION_SIGNER_ID: 'session-signer' },
}))

vi.mock('@/utils/analytics', () => ({
  identifyUser: vi.fn(),
  trackEvent: vi.fn(),
}))

vi.mock('./EarnWithServerWallet', () => ({
  EarnWithServerWallet: () => null,
}))

import { EarnWithPrivyServerWallet } from './EarnWithPrivyServerWallet'

describe('EarnWithPrivyServerWallet', () => {
  beforeEach(() => {
    privyMocks.addSessionSigners.mockReset().mockResolvedValue({})
    privyMocks.walletsReady = false
  })

  it('waits for Privy wallets before adding session signers', async () => {
    const { rerender } = render(<EarnWithPrivyServerWallet />)

    expect(privyMocks.addSessionSigners).not.toHaveBeenCalled()

    privyMocks.walletsReady = true
    rerender(<EarnWithPrivyServerWallet />)

    await waitFor(() =>
      expect(privyMocks.addSessionSigners).toHaveBeenCalledWith({
        address: '0x0000000000000000000000000000000000000001',
        signers: [{ signerId: 'session-signer' }],
      }),
    )
    expect(privyMocks.addSessionSigners).toHaveBeenCalledTimes(1)
  })
})

import { createViemAccount } from '@privy-io/node/viem'
import type { LocalAccount } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  createMockPrivyWallet,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { getRandomAddress } from '@/__mocks__/utils.js'
import { createSigner } from '@/wallet/node/wallets/hosted/privy/utils/createSigner.js'

vi.mock('@privy-io/node/viem', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('@privy-io/node/viem')),
  createViemAccount: vi.fn(),
}))

describe('createSigner (Node Privy)', () => {
  const mockAddress = getRandomAddress()
  const mockPrivyClient = createMockPrivyClient(
    'test-app-id',
    'test-app-secret',
  )
  const mockLocalAccount = {
    address: mockAddress,
    signMessage: vi.fn(),
    sign: vi.fn(),
    signTransaction: vi.fn(),
    signTypedData: vi.fn(),
  } as unknown as LocalAccount

  it('should create a LocalAccount with correct configuration', () => {
    const createdWallet = createMockPrivyWallet()
    vi.mocked(createViemAccount).mockReturnValue(mockLocalAccount)
    const authorizationContext = getMockAuthorizationContext()

    const signer = createSigner({
      privyClient: mockPrivyClient,
      authorizationContext: authorizationContext,
      walletId: createdWallet.id,
      address: createdWallet.address,
    })

    expect(createViemAccount).toHaveBeenCalledWith(mockPrivyClient, {
      walletId: createdWallet.id,
      address: createdWallet.address,
      authorizationContext,
    })
    expect(signer).toBe(mockLocalAccount)
  })
})

import { createViemAccount } from '@privy-io/server-auth/viem'
import type { Address, LocalAccount } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { getRandomAddress } from '@/test/utils.js'
import { createSigner } from '@/wallet/node/wallets/hosted/privy/utils/createSigner.js'

vi.mock('@privy-io/server-auth/viem', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('@privy-io/server-auth/viem')),
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

  it('should create a LocalAccount with correct configuration', async () => {
    const createdWallet = await mockPrivyClient.walletApi.createWallet({
      chainType: 'ethereum',
    })
    vi.mocked(createViemAccount).mockResolvedValue(mockLocalAccount)

    const signer = await createSigner({
      privyClient: mockPrivyClient,
      walletId: createdWallet.id,
      address: createdWallet.address as Address,
    })

    expect(createViemAccount).toHaveBeenCalledWith({
      walletId: createdWallet.id,
      address: createdWallet.address,
      privy: mockPrivyClient,
    })
    expect(signer).toBe(mockLocalAccount)
  })
})

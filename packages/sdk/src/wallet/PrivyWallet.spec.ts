import { type Address, type LocalAccount } from 'viem'
import { toAccount } from 'viem/accounts'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { getRandomAddress } from '@/test/utils.js'
import { PrivyWallet } from '@/wallet/PrivyWallet.js'

vi.mock('viem/accounts', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('viem/accounts')),
  toAccount: vi.fn(),
}))

const mockAddress = getRandomAddress()
const mockPrivyClient = createMockPrivyClient('test-app-id', 'test-app-secret')
const mockChainManager = new MockChainManager({
  supportedChains: [130], // Unichain
}) as unknown as ChainManager
const mockLendProvider = createMockLendProvider()
const mockLocalAccount = {
  address: mockAddress,
  signMessage: vi.fn(),
  sign: vi.fn(),
  signTransaction: vi.fn(),
  signTypedData: vi.fn(),
} as unknown as LocalAccount

describe('PrivyWallet', () => {
  it('should return the correct wallet ID', async () => {
    const createdWallet = await mockPrivyClient.walletApi.createWallet({
      chainType: 'ethereum',
    })

    const wallet = new PrivyWallet(
      mockPrivyClient,
      createdWallet.id,
      createdWallet.address as Address,
      mockChainManager,
      mockLendProvider,
    )
    expect(wallet.walletId).toBe(createdWallet.id)
  })

  it('should return the correct address', async () => {
    const createdWallet = await mockPrivyClient.walletApi.createWallet({
      chainType: 'ethereum',
    })

    const wallet = new PrivyWallet(
      mockPrivyClient,
      createdWallet.id,
      createdWallet.address as Address,
      mockChainManager,
      mockLendProvider,
    )
    expect(wallet.address).toBe(createdWallet.address)
  })

  it('should create a signer with correct configuration', async () => {
    // Create a wallet using the mock client first
    const createdWallet = await mockPrivyClient.walletApi.createWallet({
      chainType: 'ethereum',
    })

    const wallet = new PrivyWallet(
      mockPrivyClient,
      createdWallet.id,
      createdWallet.address as Address,
      mockChainManager,
      mockLendProvider,
    )

    vi.mocked(toAccount).mockReturnValue(mockLocalAccount)

    const signer = await wallet.signer()

    expect(toAccount).toHaveBeenCalledWith({
      address: createdWallet.address,
      signMessage: expect.any(Function),
      sign: expect.any(Function),
      signTransaction: expect.any(Function),
      signTypedData: expect.any(Function),
    })
    expect(signer).toBe(mockLocalAccount)
  })
})

import { createViemAccount } from '@privy-io/server-auth/viem'
import {
  type Address,
  createWalletClient,
  type LocalAccount,
  type WalletClient,
} from 'viem'
import { unichain } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { createMockLendProvider } from '@/test/MockLendProvider.js'
import { createMockPrivyClient } from '@/test/MockPrivyClient.js'
import { getRandomAddress } from '@/test/utils.js'
import { PrivyWallet } from '@/wallet/PrivyWallet.js'

vi.mock('viem', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('viem')),
  createWalletClient: vi.fn(),
}))

vi.mock('viem/accounts', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('viem/accounts')),
  toAccount: vi.fn(),
}))

vi.mock('@privy-io/server-auth/viem', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('@privy-io/server-auth/viem')),
  createViemAccount: vi.fn(),
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
    )
    expect(wallet.address).toBe(createdWallet.address)
  })

  it('should create an account with correct configuration', async () => {
    // Create a wallet using the mock client first
    const createdWallet = await mockPrivyClient.walletApi.createWallet({
      chainType: 'ethereum',
    })
    const wallet = new PrivyWallet(
      mockPrivyClient,
      createdWallet.id,
      createdWallet.address as Address,
      mockChainManager,
    )
    vi.mocked(createViemAccount).mockResolvedValue(mockLocalAccount)

    const account = await wallet.account()

    expect(createViemAccount).toHaveBeenCalledWith({
      walletId: createdWallet.id,
      address: createdWallet.address,
      privy: mockPrivyClient,
    })
    expect(account).toBe(mockLocalAccount)
  })

  it('should create a wallet client with correct configuration', async () => {
    const createdWallet = await mockPrivyClient.walletApi.createWallet({
      chainType: 'ethereum',
    })
    const wallet = new PrivyWallet(
      mockPrivyClient,
      createdWallet.id,
      createdWallet.address as Address,
      mockChainManager,
    )
    const mockWalletClient = {
      account: mockLocalAccount,
      address: createdWallet.address as Address,
    } as unknown as WalletClient
    vi.mocked(createViemAccount).mockResolvedValue(mockLocalAccount)
    vi.mocked(createWalletClient).mockResolvedValue(mockWalletClient)

    const walletClient = await wallet.walletClient(unichain.id)

    expect(createWalletClient).toHaveBeenCalledOnce()
    const callArgs = vi.mocked(createWalletClient).mock.calls[0][0]
    expect(callArgs.account).toBe(mockLocalAccount)
    expect(callArgs.chain).toBe(mockChainManager.getChain(unichain.id))
    expect(walletClient).toBe(mockWalletClient)
  })
})

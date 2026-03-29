import type { AuthorizationContext } from '@privy-io/node'
import { createViemAccount } from '@privy-io/node/viem'
import {
  type Address,
  createWalletClient,
  getAddress,
  type LocalAccount,
  type WalletClient,
} from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMockPrivyClient,
  createMockPrivyWallet,
  getMockAuthorizationContext,
} from '@/__mocks__/MockPrivyClient.js'
import { getRandomAddress } from '@/__mocks__/utils.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { PrivyWallet } from '@/wallet/node/wallets/hosted/privy/PrivyWallet.js'

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

vi.mock('@privy-io/node/viem', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('@privy-io/node/viem')),
  createViemAccount: vi.fn(),
}))

const mockAddress = getRandomAddress()
const mockPrivyClient = createMockPrivyClient('test-app-id', 'test-app-secret')
const mockChainManager = new MockChainManager({
  supportedChains: [130], // Unichain
}) as unknown as ChainManager
const mockLocalAccount = {
  address: mockAddress,
  signMessage: vi.fn(),
  sign: vi.fn(),
  signTransaction: vi.fn(),
  signTypedData: vi.fn(),
} as unknown as LocalAccount

describe('PrivyWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return the correct wallet ID', async () => {
    const createdWallet = createMockPrivyWallet()

    const wallet = await createAndInitPrivyWallet({
      address: getAddress(createdWallet.address),
      walletId: createdWallet.id,
    })

    expect(wallet.walletId).toBe(createdWallet.id)
  })

  it('should return the correct address', async () => {
    const createdWallet = createMockPrivyWallet()

    const wallet = await createAndInitPrivyWallet({
      address: getAddress(createdWallet.address),
      walletId: createdWallet.id,
    })

    expect(wallet.address).toBe(createdWallet.address)
  })

  it('should create an account with correct configuration', async () => {
    // Create a wallet using the mock client first
    const createdWallet = createMockPrivyWallet()
    vi.mocked(createViemAccount).mockResolvedValue(mockLocalAccount)
    const authorizationContext = getMockAuthorizationContext()
    const wallet = await createAndInitPrivyWallet({
      address: getAddress(createdWallet.address),
      walletId: createdWallet.id,
      authorizationContext,
    })

    expect(createViemAccount).toHaveBeenCalledWith(mockPrivyClient, {
      walletId: createdWallet.id,
      address: createdWallet.address,
      authorizationContext,
    })
    expect(wallet.signer).toBe(mockLocalAccount)
  })

  it('should create a wallet client with correct configuration', async () => {
    const createdWallet = createMockPrivyWallet()
    const wallet = await createAndInitPrivyWallet({
      walletId: createdWallet.id,
      address: createdWallet.address,
    })

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

async function createAndInitPrivyWallet(params: {
  walletId: string
  address: Address
  authorizationContext?: AuthorizationContext
}) {
  const { walletId, address, authorizationContext } = params
  return PrivyWallet.create({
    privyClient: mockPrivyClient,
    authorizationContext: authorizationContext ?? getMockAuthorizationContext(),
    walletId,
    address,
    chainManager: mockChainManager,
  })
}

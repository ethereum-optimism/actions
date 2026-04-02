import type { LocalAccount, WalletClient } from 'viem'
import { createWalletClient } from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getRandomAddress } from '@/__mocks__/utils.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { LocalWallet } from '@/wallet/node/wallets/local/LocalWallet.js'

vi.mock('viem', async () => ({
  // @ts-ignore - importActual returns unknown
  ...(await vi.importActual('viem')),
  createWalletClient: vi.fn(),
}))

const mockAddress = getRandomAddress()
const mockChainManager = new MockChainManager({
  supportedChains: [unichain.id],
}) as unknown as ChainManager

function createMockLocalAccount(): LocalAccount {
  return { address: mockAddress } as unknown as LocalAccount
}

describe('LocalWallet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should set signer and address from provided LocalAccount', async () => {
    const mockAccount = createMockLocalAccount()

    const wallet = await LocalWallet.create({
      account: mockAccount,
      chainManager: mockChainManager,
    })

    expect(wallet.address).toBe(mockAddress)
    expect(wallet.signer).toBe(mockAccount)
  })

  it('should create a wallet client with correct configuration', async () => {
    const mockAccount = createMockLocalAccount()
    const wallet = await LocalWallet.create({
      account: mockAccount,
      chainManager: mockChainManager,
    })

    const mockWalletClient = {
      account: mockAccount,
      address: mockAddress,
    } as unknown as WalletClient
    vi.mocked(createWalletClient).mockResolvedValue(mockWalletClient)

    const walletClient = await wallet.walletClient(unichain.id)

    expect(createWalletClient).toHaveBeenCalledOnce()
    const args = vi.mocked(createWalletClient).mock.calls[0][0]
    expect(args.account).toBe(mockAccount)
    expect(args.chain).toBe(mockChainManager.getChain(unichain.id))
    expect(walletClient).toBe(mockWalletClient)
  })
})

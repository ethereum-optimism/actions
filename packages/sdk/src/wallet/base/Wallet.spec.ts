import type { Address, LocalAccount, WalletClient } from 'viem'
import { unichain } from 'viem/chains'
import type { Mock } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { fetchERC20Balance, fetchETHBalance } from '@/services/tokenBalance.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import { getRandomAddress } from '@/test/utils.js'
import { Wallet } from '@/wallet/base/Wallet.js'

vi.mock('@/services/tokenBalance.js', async () => {
  return {
    fetchETHBalance: vi.fn().mockResolvedValue({} as unknown),
    fetchERC20Balance: vi.fn().mockResolvedValue({} as unknown),
  }
})

class TestWallet extends Wallet {
  public readonly address: Address
  public readonly signer: LocalAccount

  constructor(
    chainManager: ChainManager,
    address: Address,
    signer: LocalAccount,
  ) {
    super(chainManager)
    this.address = address
    this.signer = signer
  }

  // Not used in these tests
  async walletClient(_chainId: SupportedChainId): Promise<WalletClient> {
    return {} as unknown as WalletClient
  }
}

describe('Wallet (base)', () => {
  const chainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager

  const address = getRandomAddress()
  const signer = { address } as unknown as LocalAccount

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getBalance fetches ETH and ERC20 balances for supported tokens', async () => {
    const wallet = new TestWallet(chainManager, address, signer)

    const result = await wallet.getBalance()

    expect(result).toBeTruthy()
    expect(fetchETHBalance).toHaveBeenCalledTimes(1)
    expect(fetchETHBalance).toHaveBeenCalledWith(chainManager, address)

    const tokenCount = Object.values(SUPPORTED_TOKENS).length
    expect(fetchERC20Balance).toHaveBeenCalledTimes(tokenCount)

    // Ensure each call used the same chainManager and address
    for (const call of (fetchERC20Balance as Mock).mock.calls) {
      expect(call[0]).toBe(chainManager)
      expect(call[1]).toBe(address)
      expect(call[2]).toBeTruthy()
    }
  })

  it('getBalance propagates errors from underlying fetchers', async () => {
    vi.mocked(fetchETHBalance).mockRejectedValueOnce(new Error('rpc error'))

    const wallet = new TestWallet(chainManager, address, signer)

    await expect(wallet.getBalance()).rejects.toThrow('rpc error')
  })
})

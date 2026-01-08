import type { LocalAccount } from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getRandomAddress } from '@/__mocks__/utils.js'
import type { WalletLendNamespace } from '@/lend/namespaces/WalletLendNamespace.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { fetchERC20Balance, fetchETHBalance } from '@/services/tokenBalance.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import { TestWallet } from '@/wallet/core/wallets/abstract/__mocks__/TestWallet.js'

vi.mock('@/services/tokenBalance.js', async () => {
  return {
    fetchETHBalance: vi.fn().mockResolvedValue({} as unknown),
    fetchERC20Balance: vi.fn().mockResolvedValue({} as unknown),
  }
})

describe('Wallet (base)', () => {
  const chainManager = new MockChainManager({
    supportedChains: [unichain.id],
  }) as unknown as ChainManager

  const address = getRandomAddress()
  const signer = { address } as unknown as LocalAccount

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getBalance fetches ETH and ERC20 balances for all supported tokens', async () => {
    const wallet = new TestWallet(chainManager, address, signer)

    const result = await wallet.getBalance()

    expect(result).toBeTruthy()
    expect(fetchETHBalance).toHaveBeenCalledTimes(1)
    expect(fetchETHBalance).toHaveBeenCalledWith(chainManager, address)
    // Should call fetchERC20Balance for each token in SUPPORTED_TOKENS
    expect(fetchERC20Balance).toHaveBeenCalledTimes(
      Object.keys(SUPPORTED_TOKENS).length,
    )
  })

  it('getBalance propagates errors from underlying fetchers', async () => {
    vi.mocked(fetchETHBalance).mockRejectedValueOnce(new Error('rpc error'))

    const wallet = new TestWallet(chainManager, address, signer)

    await expect(wallet.getBalance()).rejects.toThrow('rpc error')
  })

  it('has lend namespace available for inheritance', () => {
    const wallet = new TestWallet(chainManager, address, signer)

    wallet.lend = {} as WalletLendNamespace
    expect(wallet.lend).toBeDefined()
    expect(wallet.lend).toEqual({})
  })
})

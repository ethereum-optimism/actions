import type { LocalAccount } from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getRandomAddress } from '@/__mocks__/utils.js'
import type { WalletLendNamespace } from '@/actions/lend/namespaces/WalletLendNamespace.js'
import { ETH, USDC } from '@/constants/assets.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { fetchERC20Balance, fetchETHBalance } from '@/services/tokenBalance.js'
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

  it('getBalance returns only ETH when no supportedAssets configured', async () => {
    const wallet = new TestWallet(chainManager, address, signer)

    const result = await wallet.getBalance()

    expect(result).toBeTruthy()
    expect(fetchETHBalance).toHaveBeenCalledTimes(1)
    expect(fetchETHBalance).toHaveBeenCalledWith(chainManager, address)
    // No supportedAssets configured, so no ERC20 balance fetches
    expect(fetchERC20Balance).toHaveBeenCalledTimes(0)
  })

  it('getBalance fetches ERC20 balances for explicitly configured assets', async () => {
    const wallet = new TestWallet(
      chainManager,
      address,
      signer,
      undefined,
      undefined,
      [ETH, USDC],
    )

    const result = await wallet.getBalance()

    expect(result).toBeTruthy()
    expect(fetchETHBalance).toHaveBeenCalledTimes(1)
    // Should call fetchERC20Balance for each configured asset
    expect(fetchERC20Balance).toHaveBeenCalledTimes(2)
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

import type { LocalAccount } from 'viem'
import { base, optimism, unichain } from 'viem/chains'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getRandomAddress } from '@/__mocks__/utils.js'
import type { WalletLendNamespace } from '@/actions/lend/namespaces/WalletLendNamespace.js'
import { ETH, USDC } from '@/constants/assets.js'
import {
  ChainNotSupportedError,
  InvalidParamsError,
} from '@/core/error/errors.js'
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
    expect(fetchETHBalance).toHaveBeenCalledWith(
      chainManager,
      address,
      undefined,
    )
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

  it('getBalance forwards chainIds to fetchers when provided', async () => {
    const multiCm = new MockChainManager({
      supportedChains: [optimism.id, base.id, unichain.id],
    }) as unknown as ChainManager
    const wallet = new TestWallet(
      multiCm,
      address,
      signer,
      undefined,
      undefined,
      [ETH, USDC],
    )

    await wallet.getBalance({ chainIds: [base.id] })

    expect(fetchETHBalance).toHaveBeenCalledWith(multiCm, address, {
      chainIds: [base.id],
    })
    expect(fetchERC20Balance).toHaveBeenCalledTimes(2)
    for (const call of vi.mocked(fetchERC20Balance).mock.calls) {
      expect(call[3]).toEqual({ chainIds: [base.id] })
    }
  })

  it('getBalance throws ChainNotSupportedError for chains outside the manager', async () => {
    const wallet = new TestWallet(chainManager, address, signer)

    await expect(
      wallet.getBalance({ chainIds: [base.id] }),
    ).rejects.toBeInstanceOf(ChainNotSupportedError)
    expect(fetchETHBalance).not.toHaveBeenCalled()
    expect(fetchERC20Balance).not.toHaveBeenCalled()
  })

  it('getBalance throws InvalidParamsError when chainIds is empty', async () => {
    const wallet = new TestWallet(chainManager, address, signer)

    await expect(wallet.getBalance({ chainIds: [] })).rejects.toBeInstanceOf(
      InvalidParamsError,
    )
    expect(fetchETHBalance).not.toHaveBeenCalled()
  })

  it('has lend namespace available for inheritance', () => {
    const wallet = new TestWallet(chainManager, address, signer)

    wallet.lend = {} as WalletLendNamespace
    expect(wallet.lend).toBeDefined()
    expect(wallet.lend).toEqual({})
  })

  describe('has', () => {
    it("returns false for a namespace that wasn't configured", () => {
      const wallet = new TestWallet(chainManager, address, signer)
      expect(wallet.has('lend')).toBe(false)
      expect(wallet.has('swap')).toBe(false)
    })

    it('returns true once a namespace has been attached', () => {
      const wallet = new TestWallet(chainManager, address, signer)
      wallet.lend = {} as WalletLendNamespace
      expect(wallet.has('lend')).toBe(true)
      expect(wallet.has('swap')).toBe(false)
    })
  })
})

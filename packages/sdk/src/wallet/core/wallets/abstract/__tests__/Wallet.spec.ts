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
import { fetchBalances } from '@/services/tokenBalance.js'
import { TestWallet } from '@/wallet/core/wallets/abstract/__mocks__/TestWallet.js'

vi.mock('@/services/tokenBalance.js', async () => {
  return {
    fetchBalances: vi.fn().mockResolvedValue([] as unknown),
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

  it('getBalance fetches only ETH when no supportedAssets configured', async () => {
    const wallet = new TestWallet({ chainManager, address, signer })

    const result = await wallet.getBalance()

    expect(result).toBeTruthy()
    expect(fetchBalances).toHaveBeenCalledTimes(1)
    expect(fetchBalances).toHaveBeenCalledWith(
      chainManager,
      address,
      [ETH],
      undefined,
    )
  })

  it('getBalance fetches ETH plus explicitly configured assets', async () => {
    const wallet = new TestWallet({
      chainManager,
      address,
      signer,
      supportedAssets: [USDC],
    })

    const result = await wallet.getBalance()

    expect(result).toBeTruthy()
    expect(fetchBalances).toHaveBeenCalledTimes(1)
    expect(fetchBalances).toHaveBeenCalledWith(
      chainManager,
      address,
      [ETH, USDC],
      undefined,
    )
  })

  it('getBalance propagates errors from the underlying fetcher', async () => {
    vi.mocked(fetchBalances).mockRejectedValueOnce(new Error('rpc error'))

    const wallet = new TestWallet({ chainManager, address, signer })

    await expect(wallet.getBalance()).rejects.toThrow('rpc error')
  })

  it('getBalance forwards chainIds to the fetcher when provided', async () => {
    const multiCm = new MockChainManager({
      supportedChains: [optimism.id, base.id, unichain.id],
    }) as unknown as ChainManager
    const wallet = new TestWallet({
      chainManager: multiCm,
      address,
      signer,
      supportedAssets: [USDC],
    })

    await wallet.getBalance({ chainIds: [base.id] })

    expect(fetchBalances).toHaveBeenCalledWith(multiCm, address, [ETH, USDC], {
      chainIds: [base.id],
    })
  })

  it('getBalance throws ChainNotSupportedError for chains outside the manager', async () => {
    const wallet = new TestWallet({ chainManager, address, signer })

    await expect(
      wallet.getBalance({ chainIds: [base.id] }),
    ).rejects.toBeInstanceOf(ChainNotSupportedError)
    expect(fetchBalances).not.toHaveBeenCalled()
  })

  it('getBalance throws InvalidParamsError when chainIds is empty', async () => {
    const wallet = new TestWallet({ chainManager, address, signer })

    await expect(wallet.getBalance({ chainIds: [] })).rejects.toBeInstanceOf(
      InvalidParamsError,
    )
    expect(fetchBalances).not.toHaveBeenCalled()
  })

  it('has lend namespace available for inheritance', () => {
    const wallet = new TestWallet({ chainManager, address, signer })

    wallet.lend = {} as WalletLendNamespace
    expect(wallet.lend).toBeDefined()
    expect(wallet.lend).toEqual({})
  })

  describe('has', () => {
    it("returns false for a namespace that wasn't configured", () => {
      const wallet = new TestWallet({ chainManager, address, signer })
      expect(wallet.has('lend')).toBe(false)
      expect(wallet.has('swap')).toBe(false)
    })

    it('returns true once a namespace has been attached', () => {
      const wallet = new TestWallet({ chainManager, address, signer })
      wallet.lend = {} as WalletLendNamespace
      expect(wallet.has('lend')).toBe(true)
      expect(wallet.has('swap')).toBe(false)
    })
  })
})

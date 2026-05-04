import type { Address } from 'viem'
import { base, optimism, unichain } from 'viem/chains'
import { beforeEach, describe, expect, it } from 'vitest'

import { MockUSDCAsset } from '@/__mocks__/MockAssets.js'
import { ETH } from '@/constants/assets.js'
import { MockChainManager } from '@/services/__mocks__/MockChainManager.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { fetchERC20Balance, fetchETHBalance } from '@/services/tokenBalance.js'
import type { Asset } from '@/types/asset.js'

describe('TokenBalance', () => {
  let chainManager: ChainManager
  const walletAddress: Address = '0x1234567890123456789012345678901234567890'

  beforeEach(() => {
    chainManager = new MockChainManager({
      supportedChains: [unichain.id],
      defaultBalance: 1000000n,
    }) as any
  })

  const multiChainManager = (): ChainManager =>
    new MockChainManager({
      supportedChains: [optimism.id, base.id, unichain.id],
      defaultBalance: 1000000n,
    }) as unknown as ChainManager

  describe('fetchBalance', () => {
    it('should fetch token balance across supported chains', async () => {
      const balance = await fetchERC20Balance(
        chainManager,
        walletAddress,
        MockUSDCAsset,
      )

      expect(balance).toEqual({
        asset: MockUSDCAsset,
        totalBalance: 1,
        totalBalanceRaw: 1000000n,
        chains: {
          [unichain.id]: {
            balance: 1,
            balanceRaw: 1000000n,
          },
        },
      })
    })

    it('should return zero balance when token not supported on any chains', async () => {
      const unsupportedAsset: Asset = {
        metadata: {
          symbol: 'UNSUPPORTED',
          name: 'Unsupported Token',
          decimals: 18,
        },
        address: {
          27637: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
        } as any,
        type: 'erc20',
      }

      const balance = await fetchERC20Balance(
        chainManager,
        walletAddress,
        unsupportedAsset,
      )

      expect(balance).toEqual({
        asset: unsupportedAsset,
        totalBalance: 0,
        totalBalanceRaw: 0n,
        chains: {},
      })
    })
  })

  describe('fetchETHBalance', () => {
    it('should fetch ETH balance across supported chains', async () => {
      const balance = await fetchETHBalance(chainManager, walletAddress)

      expect(balance).toEqual({
        asset: ETH,
        totalBalance: 0.000000000001,
        totalBalanceRaw: 1000000n,
        chains: {
          [unichain.id]: {
            balance: 0.000000000001,
            balanceRaw: 1000000n,
          },
        },
      })
    })

    it('queries only the requested chains when chainIds is provided', async () => {
      const cm = multiChainManager()

      const balance = await fetchETHBalance(cm, walletAddress, {
        chainIds: [base.id],
      })

      expect(balance.chains).toEqual({
        [base.id]: { balance: 0.000000000001, balanceRaw: 1000000n },
      })
      expect(balance.totalBalanceRaw).toBe(1000000n)
      expect(cm.getPublicClient).toHaveBeenCalledTimes(1)
      expect(cm.getPublicClient).toHaveBeenCalledWith(base.id)
    })
  })

  describe('fetchERC20Balance with chainIds filter', () => {
    it('queries only the requested chains', async () => {
      const cm = multiChainManager()

      const balance = await fetchERC20Balance(
        cm,
        walletAddress,
        MockUSDCAsset,
        { chainIds: [optimism.id, base.id] },
      )

      expect(Object.keys(balance.chains).map(Number).sort()).toEqual(
        [optimism.id, base.id].sort(),
      )
      expect(balance.totalBalanceRaw).toBe(2000000n)
    })

    it('silently skips requested chains where the asset has no address', async () => {
      const cm = multiChainManager()
      const opOnly: Asset = {
        ...MockUSDCAsset,
        address: { [optimism.id]: MockUSDCAsset.address[optimism.id] } as any,
      }

      const balance = await fetchERC20Balance(cm, walletAddress, opOnly, {
        chainIds: [optimism.id, base.id],
      })

      expect(balance.chains).toEqual({
        [optimism.id]: { balance: 1, balanceRaw: 1000000n },
      })
    })
  })
})

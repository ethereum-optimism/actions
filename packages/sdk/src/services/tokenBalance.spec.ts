import type { Address } from 'viem'
import { unichain } from 'viem/chains'
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
  })
})

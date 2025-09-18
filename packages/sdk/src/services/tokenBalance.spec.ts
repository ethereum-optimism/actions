import type { Address } from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it } from 'vitest'

import { ETH } from '@/constants/assets.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import { MockUSDCAsset } from '@/test/MockAssets.js'
import { MockChainManager } from '@/test/MockChainManager.js'
import type { Asset } from '@/types/asset.js'

import { fetchERC20Balance, fetchETHBalance } from './tokenBalance.js'

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
        symbol: 'USDC',
        totalBalance: 1000000n,
        totalFormattedBalance: '1',
        chainBalances: [
          {
            chainId: unichain.id,
            balance: 1000000n,
            formattedBalance: '1',
            tokenAddress: MockUSDCAsset.address[unichain.id]!,
          },
        ],
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
        symbol: 'UNSUPPORTED',
        totalBalance: 0n,
        totalFormattedBalance: '0',
        chainBalances: [],
      })
    })
  })

  describe('fetchETHBalance', () => {
    it('should fetch ETH balance across supported chains', async () => {
      const balance = await fetchETHBalance(chainManager, walletAddress)

      expect(balance).toEqual({
        symbol: 'ETH',
        totalBalance: 1000000n,
        totalFormattedBalance: '0.000000000001',
        chainBalances: [
          {
            chainId: unichain.id,
            balance: 1000000n,
            formattedBalance: '0.000000000001',
            tokenAddress: ETH.address[unichain.id]!,
          },
        ],
      })
    })
  })
})

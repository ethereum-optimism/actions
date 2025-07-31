import type { Address } from 'viem'
import { unichain } from 'viem/chains'
import { beforeEach, describe, expect, it } from 'vitest'

import type { ChainManager } from '@/services/ChainManager.js'
import type { TokenInfo } from '@/supported/tokens.js'
import { MockChainManager } from '@/test/MockChainManager.js'

import { fetchBalance } from './tokenBalance.js'

describe('TokenBalance', () => {
  let chainManager: ChainManager
  let mockToken: TokenInfo
  const walletAddress: Address = '0x1234567890123456789012345678901234567890'

  beforeEach(() => {
    chainManager = new MockChainManager({
      supportedChains: [unichain.id],
      defaultBalance: 1000000n,
    }) as any

    mockToken = {
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      addresses: {
        [unichain.id]: '0x078d782b760474a361dda0af3839290b0ef57ad6',
      },
    }
  })

  describe('fetchBalance', () => {
    it('should fetch token balance across supported chains', async () => {
      const balance = await fetchBalance(chainManager, walletAddress, mockToken)

      expect(balance).toEqual({
        symbol: 'USDC',
        totalBalance: 1000000n,
        chainBalances: [
          {
            chainId: unichain.id,
            balance: 1000000n,
          },
        ],
      })
    })

    it('should return zero balance when token not supported on any chains', async () => {
      const unsupportedToken: TokenInfo = {
        symbol: 'UNSUPPORTED',
        name: 'Unsupported Token',
        decimals: 18,
        addresses: {
          27637: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
        } as any,
      }

      const balance = await fetchBalance(
        chainManager,
        walletAddress,
        unsupportedToken,
      )

      expect(balance).toEqual({
        symbol: 'UNSUPPORTED',
        totalBalance: 0n,
        chainBalances: [],
      })
    })
  })
})

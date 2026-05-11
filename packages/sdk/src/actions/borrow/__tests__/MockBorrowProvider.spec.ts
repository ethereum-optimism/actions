import { baseSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { MockBorrowProvider } from '@/actions/borrow/__mocks__/MockBorrowProvider.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  BorrowMarketConfig,
  MorphoMarketParams,
} from '@/types/borrow/index.js'

const BASE_SEPOLIA_ID = baseSepolia.id as SupportedChainId

const collateralAsset = {
  type: 'erc20',
  address: { [BASE_SEPOLIA_ID]: '0xb1b0fe886ce376f28987ad24b1759a8f0a7dd839' },
  metadata: { symbol: 'dUSDC', name: 'dUSDC', decimals: 18 },
} as never

const borrowAsset = {
  type: 'erc20',
  address: { [BASE_SEPOLIA_ID]: '0xd6169405013e92387b78457fa77d377ce8cd3ee8' },
  metadata: { symbol: 'OP', name: 'OP', decimals: 18 },
} as never

const marketParams: MorphoMarketParams = {
  loanToken: '0xd6169405013e92387b78457fa77d377ce8cd3ee8',
  collateralToken: '0xb1b0fe886ce376f28987ad24b1759a8f0a7dd839',
  oracle: '0x0000000000000000000000000000000000000aaa',
  irm: '0x46415998764c29ab2a25cbea6254146d50d22687',
  lltv: 860000000000000000n,
}

const market: BorrowMarketConfig = {
  kind: 'morpho-blue',
  marketId:
    '0x1111111111111111111111111111111111111111111111111111111111111111',
  chainId: BASE_SEPOLIA_ID,
  name: 'Test market',
  collateralAsset,
  borrowAsset,
  borrowProvider: 'morpho',
  lendProvider: 'morpho',
  marketParams,
}

describe('MockBorrowProvider', () => {
  it('returns a stubbed market for an allowlisted id', async () => {
    const provider = new MockBorrowProvider({ marketAllowlist: [market] })
    const result = await provider.getMarket({
      kind: market.kind,
      marketId: market.marketId,
      chainId: market.chainId,
    })
    expect(result.maxLtv).toBeCloseTo(0.86)
    expect(result.collateralAsset).toBe(collateralAsset)
  })

  it('returns an empty position for a configured market', async () => {
    const provider = new MockBorrowProvider({ marketAllowlist: [market] })
    const position = await provider.getPosition({
      marketId: market,
      walletAddress: '0x000000000000000000000000000000000000beef',
    })
    expect(position.collateralAmount).toBe(0n)
    expect(position.healthFactor).toBeNull()
  })

  it('emits a stubbed quote from each action method', async () => {
    const provider = new MockBorrowProvider({ marketAllowlist: [market] })
    const quote = await provider.openPosition({
      market,
      walletAddress: '0x000000000000000000000000000000000000beef',
      borrowAmount: { amountRaw: 1n },
    })
    expect(quote.action).toBe('open')
    expect(quote.execution.transactions).toEqual([])
    expect(quote.expiresAt).toBeGreaterThan(quote.quotedAt)
  })

  it('lets tests override individual methods via vi.fn().mockRejectedValue', async () => {
    const provider = new MockBorrowProvider({ marketAllowlist: [market] })
    provider.repay.mockRejectedValueOnce(new Error('boom'))
    await expect(
      provider.repay({
        market,
        walletAddress: '0x000000000000000000000000000000000000beef',
        amount: { amountRaw: 1n },
      }),
    ).rejects.toThrow('boom')
  })
})

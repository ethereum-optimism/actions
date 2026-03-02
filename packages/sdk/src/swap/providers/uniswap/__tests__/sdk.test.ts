import type { Address, PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

import { encodeUniversalRouterSwap, getQuote } from '../sdk.js'

const USDC: Asset = {
  type: 'erc20',
  address: { 84532: '0x1111111111111111111111111111111111111111' as Address },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

const WETH: Asset = {
  type: 'erc20',
  address: { 84532: '0x2222222222222222222222222222222222222222' as Address },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

const QUOTER = '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba' as Address
const CHAIN_ID = 84532 as SupportedChainId
const FEE = 100
const TICK_SPACING = 2

function createMockPublicClient(
  amountResult: bigint,
  gasEstimate = 150000n,
): PublicClient {
  return {
    simulateContract: vi.fn().mockResolvedValue({
      result: [amountResult, gasEstimate],
    }),
  } as unknown as PublicClient
}

describe('getQuote', () => {
  it('returns quote for exact-in swap', async () => {
    const publicClient = createMockPublicClient(500000000000000000n) // 0.5 WETH
    const quote = await getQuote({
      assetIn: USDC,
      assetOut: WETH,
      amountInWei: 100000000n, // 100 USDC
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(quote.amountIn).toBe(100000000n)
    expect(quote.amountOut).toBe(500000000000000000n)
    expect(quote.amountInFormatted).toBe('100')
    expect(quote.amountOutFormatted).toBe('0.5')
    expect(quote.price).toBeDefined()
    expect(quote.priceInverse).toBeDefined()
    expect(quote.route.path).toEqual([USDC, WETH])
    expect(quote.route.pools).toHaveLength(1)
    expect(quote.gasEstimate).toBe(150000n)

    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'quoteExactInputSingle',
      }),
    )
  })

  it('returns quote for exact-out swap', async () => {
    const publicClient = createMockPublicClient(100000000n) // 100 USDC needed
    const quote = await getQuote({
      assetIn: USDC,
      assetOut: WETH,
      amountOutWei: 500000000000000000n, // 0.5 WETH
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(quote.amountIn).toBe(100000000n)
    expect(quote.amountOut).toBe(500000000000000000n)

    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'quoteExactOutputSingle',
      }),
    )
  })

  it('sorts currency0/currency1 correctly', async () => {
    const publicClient = createMockPublicClient(100000000n)
    await getQuote({
      assetIn: WETH, // higher address
      assetOut: USDC, // lower address
      amountInWei: 1000000000000000000n,
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const call = vi.mocked(publicClient.simulateContract).mock.calls[0][0]
    const args = (call as any).args[0]
    // currency0 should be the lower address
    expect(
      args.poolKey.currency0.toLowerCase() <
        args.poolKey.currency1.toLowerCase(),
    ).toBe(true)
  })
})

describe('encodeUniversalRouterSwap', () => {
  const baseQuote = {
    price: '0.005',
    priceInverse: '200',
    amountIn: 100000000n,
    amountOut: 500000000000000000n,
    amountInFormatted: '100',
    amountOutFormatted: '0.5',
    priceImpact: 0.001,
    route: { path: [USDC, WETH], pools: [] },
    gasEstimate: 150000n,
  }

  it('encodes exact-in swap calldata', () => {
    const calldata = encodeUniversalRouterSwap({
      amountInWei: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.005,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(calldata).toMatch(/^0x/)
    expect(calldata.length).toBeGreaterThan(10)
  })

  it('encodes exact-out swap calldata', () => {
    const calldata = encodeUniversalRouterSwap({
      amountOutWei: 500000000000000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.005,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(calldata).toMatch(/^0x/)
    expect(calldata.length).toBeGreaterThan(10)
  })

  it('produces different calldata for exact-in vs exact-out', () => {
    const exactIn = encodeUniversalRouterSwap({
      amountInWei: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.005,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const exactOut = encodeUniversalRouterSwap({
      amountOutWei: 500000000000000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.005,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(exactIn).not.toBe(exactOut)
  })

  it('applies slippage to minimum output for exact-in', () => {
    const noSlippage = encodeUniversalRouterSwap({
      amountInWei: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const withSlippage = encodeUniversalRouterSwap({
      amountInWei: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      slippage: 0.05, // 5%
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    // Different slippage should produce different calldata
    expect(noSlippage).not.toBe(withSlippage)
  })
})

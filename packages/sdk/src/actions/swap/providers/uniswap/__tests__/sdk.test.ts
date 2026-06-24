import {
  type Address,
  decodeAbiParameters,
  decodeFunctionData,
  type Hex,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'

import {
  EXACT_INPUT_SINGLE_PARAMS,
  EXACT_OUTPUT_SINGLE_PARAMS,
  UNIVERSAL_ROUTER_ABI,
} from '@/actions/swap/providers/uniswap/abis.js'
import {
  calculatePriceImpact,
  encodeUniversalRouterSwap,
  getQuote,
} from '@/actions/swap/providers/uniswap/encoding.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

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

const ETH: Asset = {
  type: 'native',
  address: { 84532: 'native' },
  metadata: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
}

const QUOTER = '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba' as Address
const POOL_MANAGER = '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408' as Address
const CHAIN_ID = 84532 as SupportedChainId
const FEE = 100
const TICK_SPACING = 2

// Mock sqrtPriceX96 for a ~2000 USDC/WETH pool
// sqrtPriceX96 = sqrt(price) * 2^96, where price = WETH/USDC adjusted for decimals
// For 1 WETH = 2000 USDC: price(token0→token1) depends on sort order
const MOCK_SQRT_PRICE =
  '0x0000000000000000000000000000000000000000000000010000000000000000' as `0x${string}`

function createMockPublicClient(
  amountResult: bigint,
  gasEstimate = 150000n,
): PublicClient {
  return {
    simulateContract: vi.fn().mockResolvedValue({
      result: [amountResult, gasEstimate],
    }),
    readContract: vi.fn().mockResolvedValue(MOCK_SQRT_PRICE),
  } as unknown as PublicClient
}

describe('getQuote', () => {
  it('returns quote for exact-in swap', async () => {
    const publicClient = createMockPublicClient(500000000000000000n) // 0.5 WETH
    const quote = await getQuote({
      assetIn: USDC,
      assetOut: WETH,
      amountInRaw: 100000000n, // 100 USDC
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(quote.amountIn).toBe(100)
    expect(quote.amountOut).toBe(0.5)
    expect(quote.amountInRaw).toBe(100000000n)
    expect(quote.amountOutRaw).toBe(500000000000000000n)
    expect(quote.price).toBeDefined()
    expect(quote.priceInverse).toBeDefined()
    expect(typeof quote.priceImpact).toBe('number')
    expect(quote.priceImpact).toBeGreaterThanOrEqual(0)
    expect(quote.route.path).toEqual([USDC, WETH])
    expect(quote.route.pools).toHaveLength(1)
    expect(quote.gasEstimate).toBe(150000n)

    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'quoteExactInputSingle',
      }),
    )
    // Should also read sqrtPriceX96 via extsload
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: POOL_MANAGER,
        functionName: 'extsload',
      }),
    )
  })

  it('returns quote for exact-out swap', async () => {
    const publicClient = createMockPublicClient(100000000n) // 100 USDC needed
    const quote = await getQuote({
      assetIn: USDC,
      assetOut: WETH,
      amountOutRaw: 500000000000000000n, // 0.5 WETH
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    expect(quote.amountInRaw).toBe(100000000n)
    expect(quote.amountOutRaw).toBe(500000000000000000n)

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
      amountInRaw: 1000000000000000000n,
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
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

  it('uses address(0) for native ETH in pool key', async () => {
    const publicClient = createMockPublicClient(100000000n)
    await getQuote({
      assetIn: ETH,
      assetOut: USDC,
      amountInRaw: 1000000000000000000n,
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const call = vi.mocked(publicClient.simulateContract).mock.calls[0][0]
    const args = (call as any).args[0]
    // Native ETH should be address(0), sorted as currency0 (lowest possible address)
    expect(args.poolKey.currency0).toBe(zeroAddress)
  })

  it('uses address(0) for native ETH as output', async () => {
    const publicClient = createMockPublicClient(1000000000000000000n)
    await getQuote({
      assetIn: USDC,
      assetOut: ETH,
      amountInRaw: 100000000n,
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const call = vi.mocked(publicClient.simulateContract).mock.calls[0][0]
    const args = (call as any).args[0]
    // Native ETH should be address(0) regardless of swap direction
    expect(args.poolKey.currency0).toBe(zeroAddress)
  })
})

describe('calculatePriceImpact', () => {
  // sqrtPriceX96 for a pool where 1 USDC-wei buys 5e9 WETH-wei
  // (100 USDC → 0.5 WETH at mid-price)
  // Computed as: sqrt(5e9) * 2^96 ≈ 70711 * 2^96
  const MID_SQRT_PRICE = 5602302599546145575577086272208896n

  it('returns 0 when sqrtPriceX96 is 0', () => {
    const impact = calculatePriceImpact({
      sqrtPriceX96: 0n,
      amountIn: 100000000n,
      amountOut: 500000000000000000n,
      zeroForOne: true,
    })
    expect(impact).toBe(0)
  })

  it('returns ~0 for a trade at mid-price', () => {
    // 100 USDC → ~0.5 WETH, which matches the mid-price
    const impact = calculatePriceImpact({
      sqrtPriceX96: MID_SQRT_PRICE,
      amountIn: 100000000n,
      amountOut: 500000000000000000n,
      zeroForOne: true,
    })

    // Very small due to integer sqrt rounding, but near 0
    expect(impact).toBeLessThan(0.001)
  })

  it('returns positive impact when execution is worse than mid-price', () => {
    // Mid-price says we should get ~0.5 WETH, but we only get 0.4 WETH
    const impact = calculatePriceImpact({
      sqrtPriceX96: MID_SQRT_PRICE,
      amountIn: 100000000n,
      amountOut: 400000000000000000n, // 0.4 WETH instead of ~0.5
      zeroForOne: true,
    })

    // ~20% price impact
    expect(impact).toBeGreaterThan(0.15)
    expect(impact).toBeLessThan(0.25)
  })

  it('clamps negative impact to 0', () => {
    // Execution was better than mid-price (got more than expected)
    const impact = calculatePriceImpact({
      sqrtPriceX96: MID_SQRT_PRICE,
      amountIn: 100000000n,
      amountOut: 600000000000000000n, // 0.6 WETH — better than ~0.5 mid
      zeroForOne: true,
    })

    expect(impact).toBe(0)
  })

  it('works for oneForZero direction', () => {
    // Selling WETH for USDC (oneForZero)
    // At mid-price: 0.5 WETH should get ~100 USDC-wei worth
    // But we only get 90 USDC → some impact
    const impact = calculatePriceImpact({
      sqrtPriceX96: MID_SQRT_PRICE,
      amountIn: 500000000000000000n, // 0.5 WETH
      amountOut: 90000000n, // 90 USDC (less than ~100)
      zeroForOne: false,
    })

    expect(impact).toBeGreaterThan(0.05)
    expect(impact).toBeLessThan(0.15)
  })
})

describe('encodeUniversalRouterSwap', () => {
  const baseQuote = {
    price: '0.005',
    priceInverse: '200',
    amountIn: 100,
    amountOut: 0.5,
    amountInRaw: 100000000n,
    amountOutRaw: 500000000000000000n,
    priceImpact: 0.001,
    route: { path: [USDC, WETH], pools: [] },
    gasEstimate: 150000n,
  }

  // Provider-derived bounds for baseQuote at 0.5% slippage.
  const AMOUNT_OUT_MIN = 497500000000000000n
  const AMOUNT_IN_MAX = 100500000n

  const isHex = (value: unknown): value is Hex =>
    typeof value === 'string' && /^0x[0-9a-fA-F]*$/.test(value)

  const isReadonlyArray = (value: unknown): value is readonly unknown[] =>
    Array.isArray(value)

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)

  const expectHex = (value: unknown, label: string): Hex => {
    if (!isHex(value)) throw new Error(`${label} is not hex`)
    return value
  }

  const expectBigInt = (value: unknown, label: string): bigint => {
    if (typeof value !== 'bigint') throw new Error(`${label} is not bigint`)
    return value
  }

  const decodeRouterInput = (calldata: Hex): Hex => {
    const { functionName, args } = decodeFunctionData({
      abi: UNIVERSAL_ROUTER_ABI,
      data: calldata,
    })
    expect(functionName).toBe('execute')
    if (!isReadonlyArray(args) || !isReadonlyArray(args[1])) {
      throw new Error('execute args are malformed')
    }
    return expectHex(args[1][0], 'router input')
  }

  const decodeV4SwapParams = (calldata: Hex): readonly unknown[] => {
    const [, swapParams] = decodeAbiParameters(
      [{ type: 'bytes' }, { type: 'bytes[]' }],
      decodeRouterInput(calldata),
    )
    if (!isReadonlyArray(swapParams)) {
      throw new Error('V4 swap params are malformed')
    }
    return swapParams
  }

  /** Decode the amountOutMinimum baked into exact-in calldata. */
  const decodeMinAmountOut = (calldata: Hex): bigint => {
    const [swap] = decodeAbiParameters(
      EXACT_INPUT_SINGLE_PARAMS,
      expectHex(decodeV4SwapParams(calldata)[0], 'exact-in params'),
    )
    if (!isRecord(swap)) throw new Error('exact-in swap is malformed')
    return expectBigInt(swap.amountOutMinimum, 'amountOutMinimum')
  }

  /** Decode the amountInMaximum baked into exact-out calldata. */
  const decodeMaxAmountIn = (calldata: Hex): bigint => {
    const [swap] = decodeAbiParameters(
      EXACT_OUTPUT_SINGLE_PARAMS,
      expectHex(decodeV4SwapParams(calldata)[0], 'exact-out params'),
    )
    if (!isRecord(swap)) throw new Error('exact-out swap is malformed')
    return expectBigInt(swap.amountInMaximum, 'amountInMaximum')
  }

  it('encodes exact-in swap calldata', () => {
    const calldata = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      amountOutMinRaw: AMOUNT_OUT_MIN,
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
      amountOutRaw: 500000000000000000n,
      assetIn: USDC,
      assetOut: WETH,
      amountInMaxRaw: AMOUNT_IN_MAX,
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

  it('bakes the provider-derived bound into calldata without recomputing', () => {
    const exactIn = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      amountOutMinRaw: AMOUNT_OUT_MIN,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })
    expect(decodeMinAmountOut(exactIn)).toBe(AMOUNT_OUT_MIN)

    const exactOut = encodeUniversalRouterSwap({
      amountOutRaw: 500000000000000000n,
      assetIn: USDC,
      assetOut: WETH,
      amountInMaxRaw: AMOUNT_IN_MAX,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })
    expect(decodeMaxAmountIn(exactOut)).toBe(AMOUNT_IN_MAX)
  })

  it('throws when the exact-in min-out floor is not supplied', () => {
    expect(() =>
      // @ts-expect-error amountOutMinRaw is required for exact-input swaps.
      encodeUniversalRouterSwap({
        amountInRaw: 100000000n,
        assetIn: USDC,
        assetOut: WETH,
        deadline: 1700000000,
        recipient: '0xrecipient' as Address,
        chainId: CHAIN_ID,
        quote: baseQuote,
        universalRouterAddress: '0xrouter' as Address,
        fee: FEE,
        tickSpacing: TICK_SPACING,
      }),
    ).toThrow(/amountOutMinRaw/)
  })

  it('throws when the exact-out max-in ceiling is not supplied', () => {
    expect(() =>
      // @ts-expect-error amountInMaxRaw is required for exact-output swaps.
      encodeUniversalRouterSwap({
        amountOutRaw: 500000000000000000n,
        assetIn: USDC,
        assetOut: WETH,
        deadline: 1700000000,
        recipient: '0xrecipient' as Address,
        chainId: CHAIN_ID,
        quote: baseQuote,
        universalRouterAddress: '0xrouter' as Address,
        fee: FEE,
        tickSpacing: TICK_SPACING,
      }),
    ).toThrow(/amountInMaxRaw/)
  })

  it('tags V4 action bytes per Uniswap v4-periphery Actions.sol', () => {
    // Regression: SWAP_EXACT_OUT_SINGLE was previously encoded as 0x07, which
    // V4Router treats as multi-hop SWAP_EXACT_IN. The router decoded our
    // single-hop EXACT_OUTPUT_SINGLE_PARAMS struct as a PathKey[] path and
    // bare-reverted on pool lookup. Correct codes:
    //   0x06 SWAP_EXACT_IN_SINGLE
    //   0x08 SWAP_EXACT_OUT_SINGLE
    const decodeActions = (calldata: Hex): Hex => {
      const [actions] = decodeAbiParameters(
        [{ type: 'bytes' }, { type: 'bytes[]' }],
        decodeRouterInput(calldata),
      )
      return expectHex(actions, 'actions')
    }

    const exactIn = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      amountOutMinRaw: AMOUNT_OUT_MIN,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })
    expect(decodeActions(exactIn)).toBe('0x060c0f')

    const exactOut = encodeUniversalRouterSwap({
      amountOutRaw: 500000000000000000n,
      assetIn: USDC,
      assetOut: WETH,
      amountInMaxRaw: AMOUNT_IN_MAX,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })
    expect(decodeActions(exactOut)).toBe('0x080c0f')
  })

  it('produces different calldata for exact-in vs exact-out', () => {
    const exactIn = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      amountOutMinRaw: AMOUNT_OUT_MIN,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const exactOut = encodeUniversalRouterSwap({
      amountOutRaw: 500000000000000000n,
      assetIn: USDC,
      assetOut: WETH,
      amountInMaxRaw: AMOUNT_IN_MAX,
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

  it('reflects a different min-out floor in exact-in calldata', () => {
    const noSlippage = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      amountOutMinRaw: 500000000000000000n, // 0% slippage → full quoted out
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    const withSlippage = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: WETH,
      amountOutMinRaw: 475000000000000000n, // 5% slippage
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      fee: FEE,
      tickSpacing: TICK_SPACING,
    })

    // A lower floor must produce different calldata.
    expect(noSlippage).not.toBe(withSlippage)
    expect(decodeMinAmountOut(noSlippage)).toBe(500000000000000000n)
    expect(decodeMinAmountOut(withSlippage)).toBe(475000000000000000n)
  })
})

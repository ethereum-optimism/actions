import {
  type Address,
  decodeAbiParameters,
  decodeFunctionData,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { describe, expect, it, vi } from 'vitest'

import {
  EXACT_INPUT_PARAMS,
  EXACT_OUTPUT_PARAMS,
  UNIVERSAL_ROUTER_ABI,
} from '@/actions/swap/providers/uniswap/abis.js'
import {
  calculatePriceImpact,
  encodeUniversalRouterSwap,
  getQuote,
  type MultiHopParams,
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

const DAI: Asset = {
  type: 'erc20',
  address: { 84532: '0x3333333333333333333333333333333333333333' as Address },
  metadata: { name: 'Dai Stablecoin', symbol: 'DAI', decimals: 18 },
}

const OP: Asset = {
  type: 'erc20',
  address: { 84532: '0x4444444444444444444444444444444444444444' as Address },
  metadata: { name: 'Optimism', symbol: 'OP', decimals: 18 },
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

  it('encodes exact-in swap calldata', () => {
    const calldata = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
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
      amountOutRaw: 500000000000000000n,
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

  it('tags V4 action bytes per Uniswap v4-periphery Actions.sol', () => {
    // Regression: SWAP_EXACT_OUT_SINGLE was previously encoded as 0x07, which
    // V4Router treats as multi-hop SWAP_EXACT_IN. The router decoded our
    // single-hop EXACT_OUTPUT_SINGLE_PARAMS struct as a PathKey[] path and
    // bare-reverted on pool lookup. Correct codes:
    //   0x06 SWAP_EXACT_IN_SINGLE
    //   0x08 SWAP_EXACT_OUT_SINGLE
    const decodeActions = (calldata: `0x${string}`): `0x${string}` => {
      const { args } = decodeFunctionData({
        abi: UNIVERSAL_ROUTER_ABI,
        data: calldata,
      })
      const [, inputs] = args as readonly [
        `0x${string}`,
        ReadonlyArray<`0x${string}`>,
        bigint,
      ]
      const [actions] = decodeAbiParameters(
        [{ type: 'bytes' }, { type: 'bytes[]' }],
        inputs[0]!,
      )
      return actions as `0x${string}`
    }

    const exactIn = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
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
    expect(decodeActions(exactIn)).toBe('0x060c0f')

    const exactOut = encodeUniversalRouterSwap({
      amountOutRaw: 500000000000000000n,
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
    expect(decodeActions(exactOut)).toBe('0x080c0f')
  })

  it('produces different calldata for exact-in vs exact-out', () => {
    const exactIn = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
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
      amountOutRaw: 500000000000000000n,
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
      amountInRaw: 100000000n,
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
      amountInRaw: 100000000n,
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

// ─────────────────────────────────────────────────────────────────────────────
// Multi-hop (V4 path-based SWAP_EXACT_IN 0x07 / SWAP_EXACT_OUT 0x09)
// ─────────────────────────────────────────────────────────────────────────────

// Decode the (actions, params[]) tuple from a V4_SWAP execute() calldata.
function decodeV4Swap(calldata: `0x${string}`): {
  actions: `0x${string}`
  params: ReadonlyArray<`0x${string}`>
} {
  const { args } = decodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    data: calldata,
  })
  const [, inputs] = args as readonly [
    `0x${string}`,
    ReadonlyArray<`0x${string}`>,
    bigint,
  ]
  const [actions, params] = decodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    inputs[0]!,
  )
  return {
    actions: actions as `0x${string}`,
    params: params as ReadonlyArray<`0x${string}`>,
  }
}

const addr = (asset: Asset): string =>
  (asset.address[84532] as string).toLowerCase()

describe('encodeUniversalRouterSwap — multi-hop', () => {
  // Configured forward route USDC → WETH → DAI.
  const multiHop: MultiHopParams = {
    assets: [USDC, WETH, DAI],
    pools: [
      { fee: 500, tickSpacing: 10 },
      { fee: 3000, tickSpacing: 60 },
    ],
  }

  const baseQuote = {
    price: '1',
    priceInverse: '1',
    amountIn: 100,
    amountOut: 99,
    amountInRaw: 100000000n,
    amountOutRaw: 99000000000000000000n,
    priceImpact: 0,
    route: { path: [USDC, DAI], pools: [] },
    gasEstimate: 200000n,
  }

  it('encodes exact-in as SWAP_EXACT_IN (0x07) with forward PathKeys', () => {
    const calldata = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: DAI,
      slippage: 0.01,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      multiHop,
    })

    const { actions, params } = decodeV4Swap(calldata)
    expect(actions).toBe('0x070c0f')

    const [decoded] = decodeAbiParameters(EXACT_INPUT_PARAMS, params[0]!)
    const p = decoded as {
      currencyIn: string
      path: ReadonlyArray<{
        intermediateCurrency: string
        fee: number
        tickSpacing: number
      }>
      amountIn: bigint
      amountOutMinimum: bigint
    }

    expect(p.currencyIn.toLowerCase()).toBe(addr(USDC))
    expect(p.amountIn).toBe(100000000n)
    // Exact-in path lists each hop's OUTPUT currency, fees aligned to pools.
    expect(p.path.map((h) => h.intermediateCurrency.toLowerCase())).toEqual([
      addr(WETH),
      addr(DAI),
    ])
    expect(p.path.map((h) => h.fee)).toEqual([500, 3000])
    expect(p.path.map((h) => h.tickSpacing)).toEqual([10, 60])
    // amountOutMinimum = 99e18 * (1 - 0.01)
    expect(p.amountOutMinimum).toBe((99000000000000000000n * 9900n) / 10000n)
  })

  it('encodes exact-out as SWAP_EXACT_OUT (0x09) with reversed PathKey currencies', () => {
    const calldata = encodeUniversalRouterSwap({
      amountOutRaw: 99000000000000000000n,
      assetIn: USDC,
      assetOut: DAI,
      slippage: 0.01,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      multiHop,
    })

    const { actions, params } = decodeV4Swap(calldata)
    expect(actions).toBe('0x090c0f')

    const [decoded] = decodeAbiParameters(EXACT_OUTPUT_PARAMS, params[0]!)
    const p = decoded as {
      currencyOut: string
      path: ReadonlyArray<{
        intermediateCurrency: string
        fee: number
        tickSpacing: number
      }>
      amountOut: bigint
      amountInMaximum: bigint
    }

    expect(p.currencyOut.toLowerCase()).toBe(addr(DAI))
    expect(p.amountOut).toBe(99000000000000000000n)
    // Exact-out path lists each hop's INPUT currency (V4 walks it backward):
    // chain [USDC, WETH, DAI] → path intermediates [USDC, WETH], fees pool-aligned.
    expect(p.path.map((h) => h.intermediateCurrency.toLowerCase())).toEqual([
      addr(USDC),
      addr(WETH),
    ])
    expect(p.path.map((h) => h.fee)).toEqual([500, 3000])
    // amountInMaximum = 100e6 * (1 + 0.01)
    expect(p.amountInMaximum).toBe(100000000n + (100000000n * 100n) / 10000n)
  })

  it('reverses the configured path for the opposite swap direction', () => {
    const calldata = encodeUniversalRouterSwap({
      amountInRaw: 99000000000000000000n,
      assetIn: DAI, // reverse of configured USDC → ... → DAI
      assetOut: USDC,
      slippage: 0.01,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: { ...baseQuote, route: { path: [DAI, USDC], pools: [] } },
      universalRouterAddress: '0xrouter' as Address,
      multiHop,
    })

    const { actions, params } = decodeV4Swap(calldata)
    expect(actions).toBe('0x070c0f')

    const [decoded] = decodeAbiParameters(EXACT_INPUT_PARAMS, params[0]!)
    const p = decoded as {
      currencyIn: string
      path: ReadonlyArray<{ intermediateCurrency: string; fee: number }>
    }

    expect(p.currencyIn.toLowerCase()).toBe(addr(DAI))
    // Reversed chain [DAI, WETH, USDC], reversed pools [3000, 500].
    expect(p.path.map((h) => h.intermediateCurrency.toLowerCase())).toEqual([
      addr(WETH),
      addr(USDC),
    ])
    expect(p.path.map((h) => h.fee)).toEqual([3000, 500])
  })

  it('encodes native ETH intermediates as address(0)', () => {
    const ethMultiHop: MultiHopParams = {
      assets: [USDC, ETH, DAI],
      pools: [
        { fee: 500, tickSpacing: 10 },
        { fee: 3000, tickSpacing: 60 },
      ],
    }

    const calldata = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: DAI,
      slippage: 0.01,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: baseQuote,
      universalRouterAddress: '0xrouter' as Address,
      multiHop: ethMultiHop,
    })

    const { params } = decodeV4Swap(calldata)
    const [decoded] = decodeAbiParameters(EXACT_INPUT_PARAMS, params[0]!)
    const p = decoded as {
      path: ReadonlyArray<{ intermediateCurrency: string }>
    }
    // Exact-in path output currencies: [ETH→0x0, DAI]
    expect(p.path[0]!.intermediateCurrency).toBe(zeroAddress)
    expect(p.path[1]!.intermediateCurrency.toLowerCase()).toBe(addr(DAI))
  })

  it('throws when the path endpoints do not match the swap pair', () => {
    // multiHop routes USDC→…→DAI, but the swap requests USDC→WETH (WETH is an
    // intermediate, not an endpoint). Encoding must refuse rather than silently
    // route to the wrong output currency.
    expect(() =>
      encodeUniversalRouterSwap({
        amountInRaw: 100000000n,
        assetIn: USDC,
        assetOut: WETH,
        slippage: 0.01,
        deadline: 1700000000,
        recipient: '0xrecipient' as Address,
        chainId: CHAIN_ID,
        quote: baseQuote,
        universalRouterAddress: '0xrouter' as Address,
        multiHop,
      }),
    ).toThrow(/path endpoints/)
  })

  it('encodes a 3-hop exact-in path with correct per-hop indexing', () => {
    const threeHop: MultiHopParams = {
      assets: [USDC, WETH, DAI, OP],
      pools: [
        { fee: 500, tickSpacing: 10 },
        { fee: 3000, tickSpacing: 60 },
        { fee: 100, tickSpacing: 1 },
      ],
    }

    const calldata = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
      assetIn: USDC,
      assetOut: OP,
      slippage: 0.01,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: { ...baseQuote, route: { path: [USDC, OP], pools: [] } },
      universalRouterAddress: '0xrouter' as Address,
      multiHop: threeHop,
    })

    const { actions, params } = decodeV4Swap(calldata)
    expect(actions).toBe('0x070c0f')

    const [decoded] = decodeAbiParameters(EXACT_INPUT_PARAMS, params[0]!)
    const p = decoded as {
      currencyIn: string
      path: ReadonlyArray<{ intermediateCurrency: string; fee: number }>
    }
    expect(p.currencyIn.toLowerCase()).toBe(addr(USDC))
    // Exact-in lists each hop's output; final hop's output is OP.
    expect(p.path.map((h) => h.intermediateCurrency.toLowerCase())).toEqual([
      addr(WETH),
      addr(DAI),
      addr(OP),
    ])
    expect(p.path.map((h) => h.fee)).toEqual([500, 3000, 100])
  })

  it('encodes exact-out in the reverse direction (0x09, input-currency path)', () => {
    const calldata = encodeUniversalRouterSwap({
      amountOutRaw: 50000000n,
      assetIn: DAI, // reverse of configured USDC → … → DAI
      assetOut: USDC,
      slippage: 0.01,
      deadline: 1700000000,
      recipient: '0xrecipient' as Address,
      chainId: CHAIN_ID,
      quote: { ...baseQuote, route: { path: [DAI, USDC], pools: [] } },
      universalRouterAddress: '0xrouter' as Address,
      multiHop,
    })

    const { actions, params } = decodeV4Swap(calldata)
    expect(actions).toBe('0x090c0f')

    const [decoded] = decodeAbiParameters(EXACT_OUTPUT_PARAMS, params[0]!)
    const p = decoded as {
      currencyOut: string
      path: ReadonlyArray<{ intermediateCurrency: string; fee: number }>
    }
    // Reversed chain [DAI, WETH, USDC]; exact-out lists hop INPUT currencies
    // [DAI, WETH] with reversed pool fees [3000, 500]; currencyOut = USDC.
    expect(p.currencyOut.toLowerCase()).toBe(addr(USDC))
    expect(p.path.map((h) => h.intermediateCurrency.toLowerCase())).toEqual([
      addr(DAI),
      addr(WETH),
    ])
    expect(p.path.map((h) => h.fee)).toEqual([3000, 500])
  })
})

describe('getQuote — multi-hop dispatch', () => {
  const multiHop: MultiHopParams = {
    assets: [USDC, WETH, DAI],
    pools: [
      { fee: 500, tickSpacing: 10 },
      { fee: 3000, tickSpacing: 60 },
    ],
  }

  it('calls quoteExactInput with a forward PathKey[] for exact-in', async () => {
    const publicClient = createMockPublicClient(99000000000000000000n)
    const quote = await getQuote({
      assetIn: USDC,
      assetOut: DAI,
      amountInRaw: 100000000n,
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      multiHop,
    })

    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'quoteExactInput' }),
    )
    // Multi-hop must not read a single-pool mid-price.
    expect(publicClient.readContract).not.toHaveBeenCalled()

    const call = vi.mocked(publicClient.simulateContract).mock.calls[0][0]
    const args = (call as any).args[0]
    expect(args.exactCurrency.toLowerCase()).toBe(addr(USDC))
    expect(
      args.path.map((h: { intermediateCurrency: string }) =>
        h.intermediateCurrency.toLowerCase(),
      ),
    ).toEqual([addr(WETH), addr(DAI)])

    expect(quote.amountInRaw).toBe(100000000n)
    expect(quote.amountOutRaw).toBe(99000000000000000000n)
    expect(quote.priceImpact).toBe(0)
    expect(quote.route.path).toEqual([USDC, WETH, DAI])
    expect(quote.route.pools).toHaveLength(2)
  })

  it('calls quoteExactOutput with the output currency for exact-out', async () => {
    const publicClient = createMockPublicClient(100000000n)
    const quote = await getQuote({
      assetIn: USDC,
      assetOut: DAI,
      amountOutRaw: 99000000000000000000n,
      chainId: CHAIN_ID,
      publicClient,
      quoterAddress: QUOTER,
      poolManagerAddress: POOL_MANAGER,
      multiHop,
    })

    expect(publicClient.simulateContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: 'quoteExactOutput' }),
    )

    const call = vi.mocked(publicClient.simulateContract).mock.calls[0][0]
    const args = (call as any).args[0]
    expect(args.exactCurrency.toLowerCase()).toBe(addr(DAI))
    // Exact-out path lists hop INPUT currencies.
    expect(
      args.path.map((h: { intermediateCurrency: string }) =>
        h.intermediateCurrency.toLowerCase(),
      ),
    ).toEqual([addr(USDC), addr(WETH)])

    expect(quote.amountInRaw).toBe(100000000n)
    expect(quote.amountOutRaw).toBe(99000000000000000000n)
  })
})

describe('encodeUniversalRouterSwap — single-hop byte parity', () => {
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

  // Regression: single-hop calldata must remain byte-identical after the
  // multi-hop refactor. Pinned values captured from the pre-refactor encoder.
  it('exact-in single-hop calldata is unchanged', () => {
    const calldata = encodeUniversalRouterSwap({
      amountInRaw: 100000000n,
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
    expect(calldata).toMatchInlineSnapshot(
      `"0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000006553f10000000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000340000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003060c0f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001e00000000000000000000000000000000000000000000000000000000000000240000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000200000000000000000000000001111111111111111111111111111111111111111000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000000000000000000640000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000005f5e10000000000000000000000000000000000000000000000000006e7799d37c1c00000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000011111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000005f5e1000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000006e7799d37c1c000"`,
    )
  })

  it('exact-out single-hop calldata is unchanged', () => {
    const calldata = encodeUniversalRouterSwap({
      amountOutRaw: 500000000000000000n,
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
    expect(calldata).toMatchInlineSnapshot(
      `"0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000006553f10000000000000000000000000000000000000000000000000000000000000000011000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000340000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000003080c0f00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000001e000000000000000000000000000000000000000000000000000000000000002400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000002000000000000000000000000011111111111111111111111111111111111111110000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000006400000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000006f05b59d3b200000000000000000000000000000000000000000000000000000000000005fd822000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000004000000000000000000000000011111111111111111111111111111111111111110000000000000000000000000000000000000000000000000000000005fd82200000000000000000000000000000000000000000000000000000000000000040000000000000000000000000222222222222222222222222222222222222222200000000000000000000000000000000000000000000000006f05b59d3b20000"`,
    )
  })
})

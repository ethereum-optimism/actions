import type { Address, Hex, PublicClient } from 'viem'
import { encodeAbiParameters, encodeFunctionData, formatUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice, SwapRoute } from '@/types/swap/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

import { getWethAddress } from './addresses.js'

/**
 * PoolKey tuple components (shared across V4 ABI definitions)
 */
const POOL_KEY_COMPONENTS = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const

/**
 * V4 Quoter ABI (subset for quoting)
 */
const QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
  {
    name: 'quoteExactOutputSingle',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: POOL_KEY_COMPONENTS },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'exactAmount', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'gasEstimate', type: 'uint256' },
    ],
  },
] as const

/**
 * Universal Router ABI (subset for swaps)
 */
const UNIVERSAL_ROUTER_ABI = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

/**
 * Resolved V4 pool parameters
 */
interface ResolvedPoolParams {
  tokenIn: Address
  tokenOut: Address
  zeroForOne: boolean
  poolKey: {
    currency0: Address
    currency1: Address
    fee: number
    tickSpacing: number
    hooks: Address
  }
}

/**
 * Resolve token addresses, currency sorting, and pool key for a V4 swap
 */
function resolvePoolParams(
  assetIn: Asset,
  assetOut: Asset,
  chainId: SupportedChainId,
  fee: number,
  tickSpacing: number,
): ResolvedPoolParams {
  const tokenIn = isNativeAsset(assetIn)
    ? getWethAddress(chainId)
    : getAssetAddress(assetIn, chainId)

  const tokenOut = isNativeAsset(assetOut)
    ? getWethAddress(chainId)
    : getAssetAddress(assetOut, chainId)

  // V4 requires sorted tokens: currency0 < currency1
  const [currency0, currency1] =
    tokenIn.toLowerCase() < tokenOut.toLowerCase()
      ? [tokenIn, tokenOut]
      : [tokenOut, tokenIn]
  const zeroForOne = tokenIn.toLowerCase() === currency0.toLowerCase()

  const poolKey = {
    currency0,
    currency1,
    fee,
    tickSpacing,
    hooks: '0x0000000000000000000000000000000000000000' as Address,
  }

  return { tokenIn, tokenOut, zeroForOne, poolKey }
}

export interface GetQuoteParams {
  assetIn: Asset
  assetOut: Asset
  amountInWei?: bigint
  amountOutWei?: bigint
  chainId: SupportedChainId
  publicClient: PublicClient
  quoterAddress: Address
  /** Fee tier in pips (e.g. 100 = 0.01%) */
  fee: number
  /** Tick spacing for the pool */
  tickSpacing: number
}

/**
 * Get a swap quote from the Quoter contract
 */
export async function getQuote(params: GetQuoteParams): Promise<SwapPrice> {
  const {
    assetIn,
    assetOut,
    amountInWei,
    amountOutWei,
    chainId,
    publicClient,
    quoterAddress,
    fee,
    tickSpacing,
  } = params

  const { tokenIn, zeroForOne, poolKey } = resolvePoolParams(
    assetIn,
    assetOut,
    chainId,
    fee,
    tickSpacing,
  )

  const isExactInput = amountInWei !== undefined

  let amountIn: bigint
  let amountOut: bigint
  let gasEstimate: bigint

  if (isExactInput) {
    const result = await publicClient.simulateContract({
      address: quoterAddress,
      abi: QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          poolKey,
          zeroForOne,
          exactAmount: amountInWei,
          hookData: '0x' as `0x${string}`,
        },
      ],
    })

    amountIn = amountInWei
    amountOut = result.result[0]
    gasEstimate = result.result[1]
  } else {
    const result = await publicClient.simulateContract({
      address: quoterAddress,
      abi: QUOTER_ABI,
      functionName: 'quoteExactOutputSingle',
      args: [
        {
          poolKey,
          zeroForOne,
          exactAmount: amountOutWei!,
          hookData: '0x' as `0x${string}`,
        },
      ],
    })

    amountIn = result.result[0]
    amountOut = amountOutWei!
    gasEstimate = result.result[1]
  }

  const price = calculatePrice(amountIn, amountOut, assetIn, assetOut)
  const priceInverse = calculatePrice(amountOut, amountIn, assetOut, assetIn)
  const priceImpact = await calculatePriceImpact({
    amountIn,
    amountOut,
    assetIn,
    assetOut,
    poolKey,
    zeroForOne,
    quoterAddress,
    publicClient,
  })

  const route: SwapRoute = {
    path: [assetIn, assetOut],
    pools: [
      {
        address: tokenIn,
        fee,
        version: 'v4',
      },
    ],
  }

  return {
    price,
    priceInverse,
    amountIn,
    amountOut,
    amountInFormatted: formatUnits(amountIn, assetIn.metadata.decimals),
    amountOutFormatted: formatUnits(amountOut, assetOut.metadata.decimals),
    priceImpact,
    route,
    gasEstimate,
  }
}

export interface EncodeSwapParams {
  amountInWei?: bigint
  amountOutWei?: bigint
  assetIn: Asset
  assetOut: Asset
  slippage: number
  deadline: number
  recipient: Address
  chainId: SupportedChainId
  quote: SwapPrice
  universalRouterAddress: Address
  /** Fee tier in pips (e.g. 100 = 0.01%) */
  fee: number
  /** Tick spacing for the pool */
  tickSpacing: number
}

// V4 Universal Router command
const V4_SWAP = 0x10

// V4 action types
const SWAP_EXACT_IN_SINGLE = 0x06
const SWAP_EXACT_OUT_SINGLE = 0x07
const SETTLE_ALL = 0x0c
const TAKE_ALL = 0x0f

/** ABI type for ExactInputSingleParams */
const EXACT_INPUT_SINGLE_PARAMS = [
  {
    type: 'tuple',
    components: [
      {
        name: 'poolKey',
        type: 'tuple',
        components: [...POOL_KEY_COMPONENTS],
      },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountIn', type: 'uint128' },
      { name: 'amountOutMinimum', type: 'uint128' },
      { name: 'hookData', type: 'bytes' },
    ],
  },
] as const

/** ABI type for ExactOutputSingleParams */
const EXACT_OUTPUT_SINGLE_PARAMS = [
  {
    type: 'tuple',
    components: [
      {
        name: 'poolKey',
        type: 'tuple',
        components: [...POOL_KEY_COMPONENTS],
      },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountOut', type: 'uint128' },
      { name: 'amountInMaximum', type: 'uint128' },
      { name: 'hookData', type: 'bytes' },
    ],
  },
] as const

/** ABI type for SETTLE_ALL / TAKE_ALL params */
const CURRENCY_AMOUNT_PARAMS = [
  { type: 'address' },
  { type: 'uint256' },
] as const

/**
 * Encode Universal Router V4 swap calldata
 * @description Builds calldata for executing a V4 swap through Universal Router
 */
export function encodeUniversalRouterSwap(params: EncodeSwapParams): Hex {
  const {
    amountInWei,
    assetIn,
    assetOut,
    slippage,
    deadline,
    chainId,
    quote,
    fee,
    tickSpacing,
  } = params

  const { tokenIn, tokenOut, zeroForOne, poolKey } = resolvePoolParams(
    assetIn,
    assetOut,
    chainId,
    fee,
    tickSpacing,
  )

  const isExactInput = amountInWei !== undefined

  let actions: Hex
  let actionParams: Hex[]

  if (isExactInput) {
    const minAmountOut =
      (quote.amountOut * BigInt(Math.floor((1 - slippage) * 10000))) / 10000n

    actions =
      `0x${[SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL].map((a) => a.toString(16).padStart(2, '0')).join('')}` as Hex

    actionParams = [
      encodeAbiParameters(EXACT_INPUT_SINGLE_PARAMS, [
        {
          poolKey,
          zeroForOne,
          amountIn: amountInWei,
          amountOutMinimum: minAmountOut,
          hookData: '0x',
        },
      ]),
      encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [tokenIn, amountInWei]),
      encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [tokenOut, minAmountOut]),
    ]
  } else {
    const maxAmountIn =
      quote.amountIn +
      (quote.amountIn * BigInt(Math.floor(slippage * 10000))) / 10000n

    actions =
      `0x${[SWAP_EXACT_OUT_SINGLE, SETTLE_ALL, TAKE_ALL].map((a) => a.toString(16).padStart(2, '0')).join('')}` as Hex

    actionParams = [
      encodeAbiParameters(EXACT_OUTPUT_SINGLE_PARAMS, [
        {
          poolKey,
          zeroForOne,
          amountOut: quote.amountOut,
          amountInMaximum: maxAmountIn,
          hookData: '0x',
        },
      ]),
      encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [tokenIn, maxAmountIn]),
      encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [tokenOut, quote.amountOut]),
    ]
  }

  // Encode V4_SWAP input: abi.encode(bytes actions, bytes[] params)
  const v4SwapInput = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [actions, actionParams],
  )

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [
      `0x${V4_SWAP.toString(16).padStart(2, '0')}` as Hex,
      [v4SwapInput],
      BigInt(deadline),
    ],
  })
}

function calculatePrice(
  amountIn: bigint,
  amountOut: bigint,
  assetIn: Asset,
  assetOut: Asset,
): string {
  const inDecimals = assetIn.metadata.decimals
  const outDecimals = assetOut.metadata.decimals

  const normalizedIn = Number(amountIn) / 10 ** inDecimals
  const normalizedOut = Number(amountOut) / 10 ** outDecimals

  return (normalizedOut / normalizedIn).toFixed(6)
}

/**
 * Calculate price impact by comparing execution price to mid-price
 * @description Quotes a 1-unit trade to approximate the mid-price,
 * then compares against the actual execution price.
 * Returns 0 for 1-unit trades (they are the reference).
 */
async function calculatePriceImpact(params: {
  amountIn: bigint
  amountOut: bigint
  assetIn: Asset
  assetOut: Asset
  poolKey: ResolvedPoolParams['poolKey']
  zeroForOne: boolean
  quoterAddress: Address
  publicClient: PublicClient
}): Promise<number> {
  const {
    amountIn,
    amountOut,
    assetIn,
    assetOut,
    poolKey,
    zeroForOne,
    quoterAddress,
    publicClient,
  } = params

  const oneUnit = BigInt(10 ** assetIn.metadata.decimals)

  // If the trade is already 1 unit, there's no meaningful impact to measure
  if (amountIn === oneUnit) return 0

  try {
    const refResult = await publicClient.simulateContract({
      address: quoterAddress,
      abi: QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [
        {
          poolKey,
          zeroForOne,
          exactAmount: oneUnit,
          hookData: '0x' as `0x${string}`,
        },
      ],
    })

    const refAmountOut = refResult.result[0]

    // midPrice = refAmountOut / oneUnit (per-unit rate)
    // executionPrice = amountOut / amountIn (actual rate)
    // priceImpact = 1 - (executionPrice / midPrice)
    const inDecimals = assetIn.metadata.decimals
    const outDecimals = assetOut.metadata.decimals

    const midPrice =
      Number(refAmountOut) /
      10 ** outDecimals /
      (Number(oneUnit) / 10 ** inDecimals)
    const execPrice =
      Number(amountOut) /
      10 ** outDecimals /
      (Number(amountIn) / 10 ** inDecimals)

    if (midPrice === 0) return 0

    const impact = 1 - execPrice / midPrice
    // Clamp to [0, 1] — negative impact means better-than-mid execution
    return Math.max(0, impact)
  } catch {
    // If reference quote fails, return 0 rather than blocking the trade
    return 0
  }
}

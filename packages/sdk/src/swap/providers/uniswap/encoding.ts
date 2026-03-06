import type { Address, Hex, PublicClient } from 'viem'
import {
  encodeAbiParameters,
  encodeFunctionData,
  formatUnits,
  keccak256,
} from 'viem'

import { WETH } from '@/constants/assets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice, SwapRoute } from '@/types/swap/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

import {
  CURRENCY_AMOUNT_PARAMS,
  EXACT_INPUT_SINGLE_PARAMS,
  EXACT_OUTPUT_SINGLE_PARAMS,
  EXTSLOAD_ABI,
  POOL_KEY_ABI_TYPE,
  QUOTER_ABI,
  UNIVERSAL_ROUTER_ABI,
} from './abis.js'

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
    ? getAssetAddress(WETH, chainId)
    : getAssetAddress(assetIn, chainId)

  const tokenOut = isNativeAsset(assetOut)
    ? getAssetAddress(WETH, chainId)
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
  poolManagerAddress: Address
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
    poolManagerAddress,
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

  // Read pool mid-price and quote in parallel — no extra sequential RPC call
  const [sqrtPriceX96, quoteResult] = await Promise.all([
    getPoolSqrtPrice({ publicClient, poolManagerAddress, poolKey }),
    isExactInput
      ? publicClient.simulateContract({
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
      : publicClient.simulateContract({
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
        }),
  ])

  const amountIn = isExactInput ? amountInWei : quoteResult.result[0]
  const amountOut = isExactInput ? quoteResult.result[0] : amountOutWei!
  const gasEstimate = quoteResult.result[1]

  const price = calculatePrice(amountIn, amountOut, assetIn, assetOut)
  const priceInverse = calculatePrice(amountOut, amountIn, assetOut, assetIn)
  const priceImpact = calculatePriceImpact({
    sqrtPriceX96,
    amountIn,
    amountOut,
    zeroForOne,
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
    amountIn: parseFloat(formatUnits(amountIn, assetIn.metadata.decimals)),
    amountOut: parseFloat(formatUnits(amountOut, assetOut.metadata.decimals)),
    amountInWei: amountIn,
    amountOutWei: amountOut,
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
      (quote.amountOutWei * BigInt(Math.round((1 - slippage) * 10000))) / 10000n

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
      quote.amountInWei +
      (quote.amountInWei * BigInt(Math.round(slippage * 10000))) / 10000n

    actions =
      `0x${[SWAP_EXACT_OUT_SINGLE, SETTLE_ALL, TAKE_ALL].map((a) => a.toString(16).padStart(2, '0')).join('')}` as Hex

    actionParams = [
      encodeAbiParameters(EXACT_OUTPUT_SINGLE_PARAMS, [
        {
          poolKey,
          zeroForOne,
          amountOut: quote.amountOutWei,
          amountInMaximum: maxAmountIn,
          hookData: '0x',
        },
      ]),
      encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [tokenIn, maxAmountIn]),
      encodeAbiParameters(CURRENCY_AMOUNT_PARAMS, [
        tokenOut,
        quote.amountOutWei,
      ]),
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

  const normalizedIn = parseFloat(formatUnits(amountIn, inDecimals))
  const normalizedOut = parseFloat(formatUnits(amountOut, outDecimals))

  return (normalizedOut / normalizedIn).toFixed(6)
}

// ─────────────────────────────────────────────────────────────────────────────
// Price impact via pool mid-price read from PoolManager storage (extsload)
// Formula mirrors Uniswap SDK's computePriceImpact:
//   (quotedOutput - actualOutput) / quotedOutput
// @see https://github.com/Uniswap/sdks/blob/main/sdks/sdk-core/src/utils/computePriceImpact.ts
// ─────────────────────────────────────────────────────────────────────────────

/** @see https://docs.uniswap.org/contracts/v4/reference/core/libraries/StateLibrary */
const POOLS_SLOT = 6n

/**
 * Read sqrtPriceX96 from a V4 pool via PoolManager.extsload (single SLOAD)
 */
export async function getPoolSqrtPrice(params: {
  publicClient: PublicClient
  poolManagerAddress: Address
  poolKey: ResolvedPoolParams['poolKey']
}): Promise<bigint> {
  const { publicClient, poolManagerAddress, poolKey } = params

  const poolId = keccak256(
    encodeAbiParameters(POOL_KEY_ABI_TYPE, [
      poolKey.currency0,
      poolKey.currency1,
      poolKey.fee,
      poolKey.tickSpacing,
      poolKey.hooks,
    ]),
  )

  // pools[poolId].slot0 — slot0 is at offset 0 from the mapping base
  const slot = keccak256(
    encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'uint256' }],
      [poolId, POOLS_SLOT],
    ),
  )

  const result = await publicClient.readContract({
    address: poolManagerAddress,
    abi: EXTSLOAD_ABI,
    functionName: 'extsload',
    args: [slot],
  })

  // sqrtPriceX96 is packed in the lower 160 bits of slot0
  return BigInt(result) & ((1n << 160n) - 1n)
}

/**
 * Price impact as a decimal (0.03 = 3%). Returns 0 if unavailable.
 */
export function calculatePriceImpact(params: {
  sqrtPriceX96: bigint
  amountIn: bigint
  amountOut: bigint
  zeroForOne: boolean
}): number {
  const { sqrtPriceX96, amountIn, amountOut, zeroForOne } = params

  if (sqrtPriceX96 === 0n) return 0

  // price(currency0→currency1) = sqrtPriceX96² / 2¹⁹² (raw wei units)
  const Q192 = 1n << 192n
  const sqrtPriceSq = sqrtPriceX96 * sqrtPriceX96

  // What you'd receive at mid-price
  const quotedOutput = zeroForOne
    ? (amountIn * sqrtPriceSq) / Q192
    : (amountIn * Q192) / sqrtPriceSq

  if (quotedOutput === 0n) return 0

  const SCALE = 10n ** 18n
  const impactScaled = ((quotedOutput - amountOut) * SCALE) / quotedOutput
  const impact = Number(impactScaled) / Number(SCALE)

  return Math.max(0, impact)
}

import type { Address, Hex, PublicClient } from 'viem'
import { encodeFunctionData, formatUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice, SwapRoute } from '@/types/swap/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

import { getWethAddress } from './addresses.js'

/**
 * Quoter V2 ABI (subset for quoting)
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
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [
      { name: 'amountOut', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
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
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceX96After', type: 'uint160' },
      { name: 'initializedTicksCrossed', type: 'uint32' },
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

export interface GetQuoteParams {
  assetIn: Asset
  assetOut: Asset
  amountInWei?: bigint
  amountOutWei?: bigint
  chainId: SupportedChainId
  publicClient: PublicClient
  quoterAddress: Address
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
  } = params

  const tokenIn = isNativeAsset(assetIn)
    ? getWethAddress(chainId)
    : getAssetAddress(assetIn, chainId)

  const tokenOut = isNativeAsset(assetOut)
    ? getWethAddress(chainId)
    : getAssetAddress(assetOut, chainId)

  const isExactInput = amountInWei !== undefined
  const fee = 500 // 0.05% fee tier

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
          tokenIn,
          tokenOut,
          amountIn: amountInWei,
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    })

    amountIn = amountInWei
    amountOut = result.result[0]
    gasEstimate = result.result[3]
  } else {
    const result = await publicClient.simulateContract({
      address: quoterAddress,
      abi: QUOTER_ABI,
      functionName: 'quoteExactOutputSingle',
      args: [
        {
          tokenIn,
          tokenOut,
          amount: amountOutWei!,
          fee,
          sqrtPriceLimitX96: 0n,
        },
      ],
    })

    amountIn = result.result[0]
    amountOut = amountOutWei!
    gasEstimate = result.result[3]
  }

  const price = calculatePrice(amountIn, amountOut, assetIn, assetOut)
  const priceInverse = calculatePrice(amountOut, amountIn, assetOut, assetIn)
  const priceImpact = calculatePriceImpact()

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
}

/**
 * Encode Universal Router swap calldata
 * @description Builds calldata for executing a swap through Universal Router
 */
export function encodeUniversalRouterSwap(params: EncodeSwapParams): Hex {
  const {
    amountInWei,
    assetIn,
    assetOut,
    slippage,
    deadline,
    recipient,
    chainId,
    quote,
  } = params

  const tokenIn = isNativeAsset(assetIn)
    ? getWethAddress(chainId)
    : getAssetAddress(assetIn, chainId)

  const tokenOut = isNativeAsset(assetOut)
    ? getWethAddress(chainId)
    : getAssetAddress(assetOut, chainId)

  const isExactInput = amountInWei !== undefined
  const fee = 500

  // Calculate minimum output with slippage
  const minAmountOut = isExactInput
    ? (quote.amountOut * BigInt(Math.floor((1 - slippage) * 10000))) / 10000n
    : quote.amountOut

  // V3_SWAP_EXACT_IN command (0x00)
  const command = isExactInput ? 0x00 : 0x01

  // Encode the path: tokenIn, fee, tokenOut
  const path = encodePath([tokenIn, tokenOut], [fee])

  // Encode swap input based on swap type
  const swapInput = isExactInput
    ? encodeExactInputSwap(recipient, amountInWei, minAmountOut, path)
    : encodeExactOutputSwap(
        recipient,
        quote.amountOut,
        quote.amountIn +
          (quote.amountIn * BigInt(Math.floor(slippage * 10000))) / 10000n,
        path,
      )

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [
      `0x${command.toString(16).padStart(2, '0')}` as Hex,
      [swapInput],
      BigInt(deadline),
    ],
  })
}

/**
 * Encode a V3 path
 */
function encodePath(tokens: Address[], fees: number[]): Hex {
  let path = tokens[0].slice(2)
  for (let i = 0; i < fees.length; i++) {
    path += fees[i].toString(16).padStart(6, '0')
    path += tokens[i + 1].slice(2)
  }
  return `0x${path}` as Hex
}

/**
 * Encode exact input swap parameters
 */
function encodeExactInputSwap(
  recipient: Address,
  amountIn: bigint,
  minAmountOut: bigint,
  path: Hex,
): Hex {
  // ABI encode: (address recipient, uint256 amountIn, uint256 amountOutMin, bytes path, bool payerIsUser)
  const encoded =
    recipient.slice(2).padStart(64, '0') +
    amountIn.toString(16).padStart(64, '0') +
    minAmountOut.toString(16).padStart(64, '0') +
    (160).toString(16).padStart(64, '0') + // offset to path
    '01'.padStart(64, '0') + // payerIsUser = true
    ((path.length - 2) / 2).toString(16).padStart(64, '0') + // path length
    path.slice(2).padEnd(64, '0') // path data

  return `0x${encoded}` as Hex
}

/**
 * Encode exact output swap parameters
 */
function encodeExactOutputSwap(
  recipient: Address,
  amountOut: bigint,
  maxAmountIn: bigint,
  path: Hex,
): Hex {
  const encoded =
    recipient.slice(2).padStart(64, '0') +
    amountOut.toString(16).padStart(64, '0') +
    maxAmountIn.toString(16).padStart(64, '0') +
    (160).toString(16).padStart(64, '0') +
    '01'.padStart(64, '0') +
    ((path.length - 2) / 2).toString(16).padStart(64, '0') +
    path.slice(2).padEnd(64, '0')

  return `0x${encoded}` as Hex
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

function calculatePriceImpact(): number {
  // Simplified - real implementation would compare against mid price
  return 0.001
}

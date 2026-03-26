import type { Address, Hex, PublicClient } from 'viem'
import { encodeAbiParameters, encodeFunctionData, encodePacked } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  CL_POOL_FACTORY_ABI,
  CL_QUOTER_ABI,
  UNIVERSAL_ROUTER_ABI,
} from '@/swap/providers/velodrome/abis.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice, SwapRoute } from '@/types/swap/index.js'

import {
  buildSwapPrice,
  resolveTokens,
  UNIVERSAL_ROUTER_MSG_SENDER,
} from '@/swap/providers/velodrome/encoding/helpers.js'

// ─────────────────────────────────────────────────────────────────────────────
// Quoting
// ─────────────────────────────────────────────────────────────────────────────

export interface GetCLQuoteParams {
  assetIn: Asset
  assetOut: Asset
  amountInRaw: bigint
  chainId: SupportedChainId
  publicClient: PublicClient
  clFactoryAddress: Address
  clQuoterAddress: Address
  tickSpacing: number
}

/**
 * Get a swap quote from a CL/Slipstream pool via QuoterV2.
 * Verifies the pool exists via the CL factory, then quotes via QuoterV2.
 * @param params - CL quote parameters
 * @returns Price quote with amounts and route
 * @throws If no CL pool exists for the given pair and tickSpacing
 */
export async function getCLQuote(params: GetCLQuoteParams): Promise<SwapPrice> {
  const {
    assetIn,
    assetOut,
    amountInRaw,
    publicClient,
    clFactoryAddress,
    clQuoterAddress,
    tickSpacing,
    chainId,
  } = params
  const { tokenIn, tokenOut } = resolveTokens(assetIn, assetOut, chainId)

  // Verify the CL pool exists
  const poolAddress = await publicClient.readContract({
    address: clFactoryAddress,
    abi: CL_POOL_FACTORY_ABI,
    functionName: 'getPool',
    args: [tokenIn, tokenOut, tickSpacing],
  })

  if (
    !poolAddress ||
    poolAddress === '0x0000000000000000000000000000000000000000'
  ) {
    throw new Error(
      `No CL pool found for ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} (tickSpacing=${tickSpacing})`,
    )
  }

  // Quote via QuoterV2.quoteExactInputSingle
  // sqrtPriceLimitX96 = 0 means no price limit
  const quoteResult = (await publicClient.readContract({
    address: clQuoterAddress,
    abi: CL_QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        tokenIn,
        tokenOut,
        amountIn: amountInRaw,
        tickSpacing,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })) as readonly [bigint, bigint, number, bigint]

  const route: SwapRoute = {
    path: [assetIn, assetOut],
    pools: [{ address: poolAddress as Address, fee: 0, version: 'v3' }],
  }
  return buildSwapPrice(assetIn, assetOut, amountInRaw, quoteResult[0], route)
}

// ─────────────────────────────────────────────────────────────────────────────
// Encoding
// ─────────────────────────────────────────────────────────────────────────────

export interface EncodeCLSwapParams {
  assetIn: Asset
  assetOut: Asset
  amountInRaw: bigint
  amountOutMin: bigint
  tickSpacing: number
  recipient: Address
  deadline: number
  chainId: SupportedChainId
}

/** Universal Router V3_SWAP_EXACT_IN command byte */
const V3_SWAP_EXACT_IN = 0x00

/**
 * Encode a V3_SWAP_EXACT_IN command for a CL/Slipstream pool on the Universal Router.
 * Path: encodePacked([tokenIn (20), tickSpacing as int24 (3), tokenOut (20)]) — 43 bytes.
 * @param params - CL swap encoding parameters
 * @returns Encoded calldata as hex string
 */
export function encodeCLSwap(params: EncodeCLSwapParams): Hex {
  const { amountInRaw, amountOutMin, tickSpacing, deadline, chainId } = params
  const { tokenIn, tokenOut } = resolveTokens(
    params.assetIn,
    params.assetOut,
    chainId,
  )

  const commands = `0x${V3_SWAP_EXACT_IN.toString(16).padStart(2, '0')}` as Hex

  // CL path: [tokenIn (20)] [tickSpacing as int24 (3)] [tokenOut (20)] — 43 bytes
  const path = encodePacked(
    ['address', 'int24', 'address'],
    [tokenIn, tickSpacing, tokenOut],
  )

  const input = encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'bytes' },
      { type: 'bool' },
    ],
    [
      UNIVERSAL_ROUTER_MSG_SENDER, // recipient = msg.sender (Universal Router sentinel)
      amountInRaw,
      amountOutMin,
      path,
      false, // payerIsUser — tokens pre-transferred to router
    ],
  )

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, [input], BigInt(deadline)],
  })
}

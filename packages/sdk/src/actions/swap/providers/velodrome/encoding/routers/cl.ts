import type { Address, Hex, PublicClient } from 'viem'
import { encodeAbiParameters, encodeFunctionData, encodePacked } from 'viem'

import {
  CL_POOL_FACTORY_ABI,
  CL_QUOTER_ABI,
  UNIVERSAL_ROUTER_ABI,
} from '@/actions/swap/providers/velodrome/abis.js'
import {
  buildSwapPrice,
  resolveTokens,
} from '@/actions/swap/providers/velodrome/encoding/helpers.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { MarketNotAllowedError } from '@/core/error/errors.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice, SwapRoute } from '@/types/swap/index.js'

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
    throw new MarketNotAllowedError({
      assetInSymbol: assetIn.metadata.symbol,
      assetOutSymbol: assetOut.metadata.symbol,
      chainId,
      reason: `No CL pool found for ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} (tickSpacing=${tickSpacing})`,
    })
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

/** ABI param shape for the V3_SWAP_EXACT_IN input payload. Shared with tests. */
export const V3_SWAP_EXACT_IN_INPUT_PARAMS = [
  { name: 'recipient', type: 'address' },
  { name: 'amountIn', type: 'uint256' },
  { name: 'amountOutMin', type: 'uint256' },
  { name: 'path', type: 'bytes' },
  { name: 'payerIsUser', type: 'bool' },
] as const

/**
 * Encode a V3_SWAP_EXACT_IN command for a CL/Slipstream pool on the Universal Router.
 * Path: encodePacked([tokenIn (20), tickSpacing as int24 (3), tokenOut (20)]) — 43 bytes.
 *
 * payerIsUser = true: the router pulls tokens from msg.sender via standard
 * transferFrom against an existing ERC20 allowance. Works for both EOAs (sequential
 * approve + execute) and smart wallets (atomic approve + execute in one UserOp).
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

  const commands = encodePacked(['uint8'], [V3_SWAP_EXACT_IN])

  // CL path: [tokenIn (20)] [tickSpacing as int24 (3)] [tokenOut (20)] — 43 bytes
  const path = encodePacked(
    ['address', 'int24', 'address'],
    [tokenIn, tickSpacing, tokenOut],
  )

  const input = encodeAbiParameters(V3_SWAP_EXACT_IN_INPUT_PARAMS, [
    params.recipient,
    amountInRaw,
    amountOutMin,
    path,
    true, // payerIsUser — router pulls from msg.sender via transferFrom
  ])

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, [input], BigInt(deadline)],
  })
}

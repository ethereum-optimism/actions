import type { Address, Hex, PublicClient } from 'viem'
import {
  encodeAbiParameters,
  encodeFunctionData,
  encodePacked,
  formatUnits,
} from 'viem'

import { WETH } from '@/constants/assets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  CL_POOL_FACTORY_ABI,
  CL_QUOTER_ABI,
  LEAF_ROUTER_ABI,
  POOL_ABI,
  POOL_FACTORY_ABI,
  UNIVERSAL_ROUTER_ABI,
  V2_ROUTER_ABI,
} from '@/swap/providers/velodrome/abis.js'
import type { VelodromeRouterType } from '@/swap/providers/velodrome/addresses.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice, SwapRoute } from '@/types/swap/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Sentinel: route output to msg.sender */
const MSG_SENDER = '0x0000000000000000000000000000000000000001' as Address

/** Resolve asset pair to on-chain token addresses for a given chain. */
function resolveTokens(
  assetIn: Asset,
  assetOut: Asset,
  chainId: SupportedChainId,
): { tokenIn: Address; tokenOut: Address } {
  const tokenIn = isNativeAsset(assetIn)
    ? getWrappedNativeAddress(chainId)
    : getAssetAddress(assetIn, chainId)
  const tokenOut = isNativeAsset(assetOut)
    ? getWrappedNativeAddress(chainId)
    : getAssetAddress(assetOut, chainId)
  return { tokenIn, tokenOut }
}

/**
 * Get the wrapped native token address for a chain.
 * Velodrome routers require WETH address in Route structs, not address(0).
 */
function getWrappedNativeAddress(chainId: SupportedChainId): Address {
  const addr = WETH.address[chainId]
  if (!addr || addr === 'native') {
    throw new Error(`No WETH address configured for chain ${chainId}`)
  }
  return addr
}

/** Build a SwapPrice from raw quote data. */
function buildSwapPrice(
  assetIn: Asset,
  assetOut: Asset,
  amountInRaw: bigint,
  amountOutRaw: bigint,
  route: SwapRoute,
): SwapPrice {
  const amountIn = parseFloat(
    formatUnits(amountInRaw, assetIn.metadata.decimals),
  )
  const amountOut = parseFloat(
    formatUnits(amountOutRaw, assetOut.metadata.decimals),
  )
  return {
    price: (amountOut / amountIn).toFixed(6),
    priceInverse: (amountIn / amountOut).toFixed(6),
    amountIn,
    amountOut,
    amountInRaw,
    amountOutRaw,
    priceImpact: 0,
    route,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 AMM quoting
// ─────────────────────────────────────────────────────────────────────────────

export interface GetQuoteParams {
  assetIn: Asset
  assetOut: Asset
  amountInRaw: bigint
  chainId: SupportedChainId
  publicClient: PublicClient
  routerAddress: Address
  routerType: VelodromeRouterType
  stable: boolean
  factoryAddress: Address
}

/**
 * Get a v2 AMM swap quote.
 * @param params - Quote parameters including router type
 * @returns Price quote with amounts and route
 */
export async function getQuote(params: GetQuoteParams): Promise<SwapPrice> {
  const { assetIn, assetOut, amountInRaw, chainId } = params
  const { tokenIn, tokenOut } = resolveTokens(assetIn, assetOut, chainId)
  const amountOutRaw = await fetchAmountOut(params, tokenIn, tokenOut)
  const route: SwapRoute = {
    path: [assetIn, assetOut],
    pools: [{ address: tokenIn, fee: 0, version: 'v2' }],
  }
  return buildSwapPrice(assetIn, assetOut, amountInRaw, amountOutRaw, route)
}

/** Fetch the output amount using the appropriate quoting mechanism for the router type. */
async function fetchAmountOut(
  params: GetQuoteParams,
  tokenIn: Address,
  tokenOut: Address,
): Promise<bigint> {
  const { routerType } = params

  if (routerType === 'universal') {
    return fetchAmountOutViaPool(params, tokenIn, tokenOut)
  }
  if (routerType === 'v2') {
    return fetchAmountOutViaRouter(params, tokenIn, tokenOut, V2_ROUTER_ABI, {
      from: tokenIn,
      to: tokenOut,
      stable: params.stable,
      factory: params.factoryAddress,
    })
  }
  if (routerType === 'leaf') {
    return fetchAmountOutViaRouter(params, tokenIn, tokenOut, LEAF_ROUTER_ABI, {
      from: tokenIn,
      to: tokenOut,
      stable: params.stable,
    })
  }
  throw new Error(`Unknown router type: ${routerType as string}`)
}

/** Quote via Pool.getAmountOut (Universal Router path — no legacy router available). */
async function fetchAmountOutViaPool(
  params: GetQuoteParams,
  tokenIn: Address,
  tokenOut: Address,
): Promise<bigint> {
  const { publicClient, factoryAddress, stable, assetIn, assetOut } = params

  const poolAddress = await publicClient.readContract({
    address: factoryAddress,
    abi: POOL_FACTORY_ABI,
    functionName: 'getPool',
    args: [tokenIn, tokenOut, stable],
  })

  if (
    !poolAddress ||
    poolAddress === '0x0000000000000000000000000000000000000000'
  ) {
    throw new Error(
      `No Velodrome pool found for ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} (stable=${stable})`,
    )
  }

  return (await publicClient.readContract({
    address: poolAddress as Address,
    abi: POOL_ABI,
    functionName: 'getAmountOut',
    args: [params.amountInRaw, tokenIn],
  })) as bigint
}

/** Quote via Router.getAmountsOut (v2 and leaf router path). */
async function fetchAmountOutViaRouter(
  params: GetQuoteParams,
  tokenIn: Address,
  tokenOut: Address,
  abi: typeof V2_ROUTER_ABI | typeof LEAF_ROUTER_ABI,
  route: { from: Address; to: Address; stable: boolean; factory?: Address },
): Promise<bigint> {
  const amounts = await params.publicClient.readContract({
    address: params.routerAddress,
    abi,
    functionName: 'getAmountsOut',
    args: [params.amountInRaw, [route]],
  })
  return (amounts as bigint[])[1]
}

// ─────────────────────────────────────────────────────────────────────────────
// V2 AMM encoding
// ─────────────────────────────────────────────────────────────────────────────

export interface EncodeSwapParams {
  assetIn: Asset
  assetOut: Asset
  amountInRaw: bigint
  amountOutMin: bigint
  routerType: VelodromeRouterType
  stable: boolean
  factoryAddress: Address
  recipient: Address
  deadline: number
  chainId: SupportedChainId
}

/**
 * Encode swap calldata for the appropriate router type.
 * @param params - Swap encoding parameters
 * @returns Encoded calldata as hex string
 */
export function encodeSwap(params: EncodeSwapParams): Hex {
  const { routerType } = params
  const { tokenIn, tokenOut } = resolveTokens(
    params.assetIn,
    params.assetOut,
    params.chainId,
  )

  if (routerType === 'universal') {
    return encodeUniversalV2Swap(tokenIn, tokenOut, params)
  }
  if (routerType === 'v2') {
    return encodeLegacySwap(tokenIn, tokenOut, params, V2_ROUTER_ABI, {
      from: tokenIn,
      to: tokenOut,
      stable: params.stable,
      factory: params.factoryAddress,
    })
  }
  if (routerType === 'leaf') {
    return encodeLegacySwap(tokenIn, tokenOut, params, LEAF_ROUTER_ABI, {
      from: tokenIn,
      to: tokenOut,
      stable: params.stable,
    })
  }
  throw new Error(`Unknown router type: ${routerType as string}`)
}

/** Universal Router V2_SWAP_EXACT_IN command byte */
const V2_SWAP_EXACT_IN = 0x08

/**
 * Encode a V2_SWAP_EXACT_IN command for the Universal Router.
 * Route: encodePacked(tokenIn, stable, tokenOut) — 41 bytes per hop.
 * payerIsUser = false: tokens are pre-transferred to the Router by the smart wallet.
 */
function encodeUniversalV2Swap(
  tokenIn: Address,
  tokenOut: Address,
  params: EncodeSwapParams,
): Hex {
  const commands = `0x${V2_SWAP_EXACT_IN.toString(16).padStart(2, '0')}` as Hex
  const routes = encodePacked(
    ['address', 'bool', 'address'],
    [tokenIn, params.stable, tokenOut],
  )
  const input = encodeAbiParameters(
    [
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'bytes' },
      { type: 'bool' },
      { type: 'bool' },
    ],
    [
      MSG_SENDER,
      params.amountInRaw,
      params.amountOutMin,
      routes,
      false, // payerIsUser
      false, // isUni — false for Velodrome/Aerodrome
    ],
  )
  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, [input], BigInt(params.deadline)],
  })
}

/**
 * Encode swap calldata for legacy v2 or leaf routers.
 * Selects the correct swap function based on whether native ETH is involved.
 */
function encodeLegacySwap(
  tokenIn: Address,
  tokenOut: Address,
  params: EncodeSwapParams,
  abi: typeof V2_ROUTER_ABI | typeof LEAF_ROUTER_ABI,
  route: { from: Address; to: Address; stable: boolean; factory?: Address },
): Hex {
  const { assetIn, assetOut, amountInRaw, amountOutMin, recipient, deadline } =
    params

  if (isNativeAsset(assetIn)) {
    return encodeFunctionData({
      abi,
      functionName: 'swapExactETHForTokens',
      args: [amountOutMin, [route], recipient, BigInt(deadline)],
    })
  }

  if (isNativeAsset(assetOut)) {
    return encodeFunctionData({
      abi,
      functionName: 'swapExactTokensForETH',
      args: [amountInRaw, amountOutMin, [route], recipient, BigInt(deadline)],
    })
  }

  return encodeFunctionData({
    abi,
    functionName: 'swapExactTokensForTokens',
    args: [amountInRaw, amountOutMin, [route], recipient, BigInt(deadline)],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// CL / Slipstream quoting
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
// CL / Slipstream encoding
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
      MSG_SENDER,
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

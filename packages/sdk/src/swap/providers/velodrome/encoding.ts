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

export interface GetQuoteParams {
  assetIn: Asset
  assetOut: Asset
  amountInWei: bigint
  chainId: SupportedChainId
  publicClient: PublicClient
  routerAddress: Address
  routerType: VelodromeRouterType
  stable: boolean
  factoryAddress: Address
}

/**
 * Get a swap quote. Routes to the correct quoting mechanism based on router type:
 * - v2/leaf: Router.getAmountsOut()
 * - universal: Pool.getAmountOut() directly (no legacy router available)
 */
export async function getQuote(params: GetQuoteParams): Promise<SwapPrice> {
  const {
    assetIn,
    assetOut,
    amountInWei,
    publicClient,
    routerAddress,
    routerType,
    stable,
    factoryAddress,
    chainId,
  } = params

  const tokenIn = isNativeAsset(assetIn)
    ? getWrappedNativeAddress(chainId)
    : getAssetAddress(assetIn, chainId)

  const tokenOut = isNativeAsset(assetOut)
    ? getWrappedNativeAddress(chainId)
    : getAssetAddress(assetOut, chainId)

  let amountOutWei: bigint

  if (routerType === 'universal') {
    // Look up the pool and quote directly
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

    amountOutWei = (await publicClient.readContract({
      address: poolAddress as Address,
      abi: POOL_ABI,
      functionName: 'getAmountOut',
      args: [amountInWei, tokenIn],
    })) as bigint
  } else {
    // Legacy router quoting
    const abi = routerType === 'v2' ? V2_ROUTER_ABI : LEAF_ROUTER_ABI
    const route =
      routerType === 'v2'
        ? { from: tokenIn, to: tokenOut, stable, factory: factoryAddress }
        : { from: tokenIn, to: tokenOut, stable }

    const amounts = await publicClient.readContract({
      address: routerAddress,
      abi,
      functionName: 'getAmountsOut',
      args: [amountInWei, [route]],
    })
    amountOutWei = (amounts as bigint[])[1]
  }

  const normalizedIn = parseFloat(
    formatUnits(amountInWei, assetIn.metadata.decimals),
  )
  const normalizedOut = parseFloat(
    formatUnits(amountOutWei, assetOut.metadata.decimals),
  )

  const price = (normalizedOut / normalizedIn).toFixed(6)
  const priceInverse = (normalizedIn / normalizedOut).toFixed(6)

  const swapRoute: SwapRoute = {
    path: [assetIn, assetOut],
    pools: [{ address: tokenIn, fee: 0, version: 'v2' }],
  }

  return {
    price,
    priceInverse,
    amountIn: normalizedIn,
    amountOut: normalizedOut,
    amountInWei,
    amountOutWei,
    priceImpact: 0,
    route: swapRoute,
  }
}

export interface EncodeSwapParams {
  assetIn: Asset
  assetOut: Asset
  amountInWei: bigint
  amountOutMin: bigint
  routerType: VelodromeRouterType
  stable: boolean
  factoryAddress: Address
  recipient: Address
  deadline: number
  chainId: SupportedChainId
}

/** Universal Router V2_SWAP_EXACT_IN command */
const V2_SWAP_EXACT_IN = 0x08
/** Sentinel: route output to msg.sender */
const MSG_SENDER = '0x0000000000000000000000000000000000000001' as Address

/**
 * Encode swap calldata. Routes to the correct encoding based on router type:
 * - v2/leaf: Legacy Router swapExactTokensForTokens/ETH variants
 * - universal: Universal Router execute() with V2_SWAP_EXACT_IN command
 */
export function encodeSwap(params: EncodeSwapParams): Hex {
  const {
    assetIn,
    assetOut,
    amountInWei,
    amountOutMin,
    routerType,
    stable,
    factoryAddress,
    recipient,
    deadline,
    chainId,
  } = params

  const tokenIn = isNativeAsset(assetIn)
    ? getWrappedNativeAddress(chainId)
    : getAssetAddress(assetIn, chainId)

  const tokenOut = isNativeAsset(assetOut)
    ? getWrappedNativeAddress(chainId)
    : getAssetAddress(assetOut, chainId)

  if (routerType === 'universal') {
    return encodeUniversalRouterSwap(
      tokenIn,
      tokenOut,
      amountInWei,
      amountOutMin,
      stable,
      deadline,
    )
  }

  return encodeLegacyRouterSwap(
    assetIn,
    assetOut,
    tokenIn,
    tokenOut,
    amountInWei,
    amountOutMin,
    routerType,
    stable,
    factoryAddress,
    recipient,
    deadline,
  )
}

/**
 * Encode a V2_SWAP_EXACT_IN command for the Universal Router.
 * Route format: abi.encodePacked(tokenIn, stable, tokenOut) — 41 bytes per hop.
 * The 6th param `isUni` is false for Velodrome/Aerodrome pools.
 */
function encodeUniversalRouterSwap(
  tokenIn: Address,
  tokenOut: Address,
  amountInWei: bigint,
  amountOutMin: bigint,
  stable: boolean,
  deadline: number,
): Hex {
  const commands = `0x${V2_SWAP_EXACT_IN.toString(16).padStart(2, '0')}` as Hex

  // Velodrome V2 route: [tokenIn (20)] [stable (1)] [tokenOut (20)]
  const routes = encodePacked(
    ['address', 'bool', 'address'],
    [tokenIn, stable, tokenOut],
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
      MSG_SENDER, // recipient
      amountInWei,
      amountOutMin,
      routes,
      true, // payerIsUser — pull tokens from caller via Permit2
      false, // isUni — false for Velodrome/Aerodrome
    ],
  )

  return encodeFunctionData({
    abi: UNIVERSAL_ROUTER_ABI,
    functionName: 'execute',
    args: [commands, [input], BigInt(deadline)],
  })
}

/** Encode swap calldata for legacy v2 or leaf routers */
function encodeLegacyRouterSwap(
  assetIn: Asset,
  assetOut: Asset,
  tokenIn: Address,
  tokenOut: Address,
  amountInWei: bigint,
  amountOutMin: bigint,
  routerType: 'v2' | 'leaf',
  stable: boolean,
  factoryAddress: Address,
  recipient: Address,
  deadline: number,
): Hex {
  const abi = routerType === 'v2' ? V2_ROUTER_ABI : LEAF_ROUTER_ABI
  const route =
    routerType === 'v2'
      ? { from: tokenIn, to: tokenOut, stable, factory: factoryAddress }
      : { from: tokenIn, to: tokenOut, stable }

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
      args: [amountInWei, amountOutMin, [route], recipient, BigInt(deadline)],
    })
  }

  return encodeFunctionData({
    abi,
    functionName: 'swapExactTokensForTokens',
    args: [amountInWei, amountOutMin, [route], recipient, BigInt(deadline)],
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

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

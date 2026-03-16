import type { Address, Hex, PublicClient } from 'viem'
import { encodeFunctionData, formatUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  LEAF_ROUTER_ABI,
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
 * Get a swap quote from the Velodrome/Aerodrome Router via getAmountsOut.
 * @param params - Quote parameters including assets, amount, and router details
 * @returns Price quote with amounts and route information
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

  const amountOutWei = (amounts as bigint[])[1]

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
    pools: [
      {
        address: tokenIn,
        fee: 0,
        version: 'v2',
      },
    ],
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

/**
 * Encode Velodrome/Aerodrome Router swap calldata.
 * Selects the correct swap function based on whether ETH is involved.
 * @param params - Swap encoding parameters
 * @returns Encoded calldata as hex string
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
 * WETH addresses per chain for Velodrome/Aerodrome route construction.
 * Router getAmountsOut requires the wrapped native token address, not address(0).
 */
const WRAPPED_NATIVE: Partial<Record<SupportedChainId, Address>> = {
  // Optimism — WETH
  10: '0x4200000000000000000000000000000000000006',
  // Base — WETH
  8453: '0x4200000000000000000000000000000000000006',
  // Leaf chains share the standard OP Stack WETH at the predeploy address
  60808: '0x4200000000000000000000000000000000000006',
  42220: '0x4200000000000000000000000000000000000006',
  252: '0x4200000000000000000000000000000000000006',
  57073: '0x4200000000000000000000000000000000000006',
  1135: '0x4200000000000000000000000000000000000006',
  1750: '0x4200000000000000000000000000000000000006',
  34443: '0x4200000000000000000000000000000000000006',
  1868: '0x4200000000000000000000000000000000000006',
  5330: '0x4200000000000000000000000000000000000006',
  1923: '0x4200000000000000000000000000000000000006',
  130: '0x4200000000000000000000000000000000000006',
}

/**
 * Get the wrapped native token address for a chain.
 * Velodrome routers require WETH address in Route structs, not address(0).
 */
function getWrappedNativeAddress(chainId: SupportedChainId): Address {
  const addr = WRAPPED_NATIVE[chainId]
  if (!addr) {
    throw new Error(
      `No wrapped native token address configured for chain ${chainId}`,
    )
  }
  return addr
}

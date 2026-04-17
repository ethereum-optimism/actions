import type { Address } from 'viem'
import { formatUnits } from 'viem'

import { UNIVERSAL_ROUTER_MSG_SENDER } from '@/actions/swap/core/markets.js'
import { WETH } from '@/constants/assets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { SwapPrice, SwapRoute } from '@/types/swap/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

export { UNIVERSAL_ROUTER_MSG_SENDER }

/**
 * Resolve an asset pair to on-chain token addresses for a given chain.
 * Native ETH is converted to the WETH predeploy address.
 * @param assetIn - Input asset
 * @param assetOut - Output asset
 * @param chainId - Target chain
 * @returns Resolved token addresses
 */
export function resolveTokens(
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
 * Velodrome routers require WETH in Route structs, not address(0).
 * @param chainId - Target chain
 * @returns WETH address
 * @throws If no WETH address configured for the chain
 */
export function getWrappedNativeAddress(chainId: SupportedChainId): Address {
  const addr = WETH.address[chainId]
  if (!addr || addr === 'native') {
    throw new Error(`No WETH address configured for chain ${chainId}`)
  }
  return addr
}

/**
 * Build a SwapPrice from raw quote data.
 * @param assetIn - Input asset (for decimal conversion)
 * @param assetOut - Output asset (for decimal conversion)
 * @param amountInRaw - Input amount as raw bigint
 * @param amountOutRaw - Output amount as raw bigint
 * @param route - Swap route information
 * @returns SwapPrice with human-readable and raw amounts
 */
export function buildSwapPrice(
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

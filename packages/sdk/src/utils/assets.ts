import type { Address } from 'viem'
import { parseUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

/**
 * Parse human-readable amount to wei using an asset's decimals.
 * Returns undefined when amount is undefined.
 */
export function parseAssetAmount(amount: number, asset: Asset): bigint
export function parseAssetAmount(
  amount: number | undefined,
  asset: Asset,
): bigint | undefined
export function parseAssetAmount(
  amount: number | undefined,
  asset: Asset,
): bigint | undefined {
  if (amount === undefined) return undefined
  return parseUnits(amount.toString(), asset.metadata.decimals)
}

/**
 * Convert wei/smallest unit back to human-readable amount
 * @param amount - Amount in smallest unit
 * @param decimals - Token decimals
 * @returns Human-readable amount as number
 */
export function formatAssetAmount(amount: bigint, decimals: number): number {
  // Convert to string, then to number
  const divisor = 10n ** BigInt(decimals)
  const wholePart = amount / divisor
  const fractionalPart = amount % divisor

  // Handle fractional part with proper precision
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
  const result = `${wholePart}.${fractionalStr}`

  return parseFloat(result)
}

/**
 * Check if asset is a native asset (e.g. ETH)
 * @param asset - Asset definition
 * @returns Whether the asset is native
 */
export function isNativeAsset(asset: Asset): boolean {
  return asset.type === 'native'
}

/**
 * Check if asset is supported on a specific chain
 * @param asset - Asset definition
 * @param chainId - Chain ID
 * @returns Whether the asset is supported on the chain
 */
export function isAssetSupportedOnChain(
  asset: Asset,
  chainId: SupportedChainId,
): boolean {
  return !!asset.address[chainId]
}

/**
 * Get asset address for a specific chain
 * @param asset - Asset definition
 * @param chainId - Chain ID
 * @returns Asset address on the specified chain
 * @throws Error if asset is not supported on the chain or is a native asset
 */
export function getAssetAddress(
  asset: Asset,
  chainId: SupportedChainId,
): Address {
  const address = asset.address[chainId]
  if (!address) {
    throw new Error(
      `Asset ${asset.metadata.symbol} is not supported on chain ${chainId}`,
    )
  }
  if (address === 'native') {
    throw new Error(
      `Asset ${asset.metadata.symbol} is a native asset and has no contract address.`,
    )
  }
  return address
}

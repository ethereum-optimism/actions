import type { Address } from 'viem'
import { parseUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

/**
 * Parse human-readable amount to wei/smallest unit
 * @param amount - Human-readable amount (e.g. 1.5)
 * @param decimals - Token decimals
 * @returns Amount in smallest unit (wei equivalent)
 */
export function parseAssetAmount(amount: number, decimals: number): bigint {
  // Convert number to string with proper precision
  const amountStr = amount.toString()

  // Use viem's parseUnits for proper decimal handling
  return parseUnits(amountStr, decimals)
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
      `Asset ${asset.metadata.symbol} is a native asset and has no contract address. Use asset.type === 'native' to check.`,
    )
  }
  return address
}

import type { Address } from 'viem'
import { parseUnits } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { getTokenAddress, SUPPORTED_TOKENS } from '@/supported/tokens.js'

/**
 * Asset identifier - can be a symbol (like 'usdc') or address
 */
export type AssetIdentifier = string | Address

/**
 * Resolved asset information
 */
export interface ResolvedAsset {
  address: Address
  symbol: string
  decimals: number
}

/**
 * Resolve asset identifier to address and metadata
 * @param asset - Asset symbol (e.g. 'usdc') or address
 * @param chainId - Chain ID to resolve for
 * @returns Resolved asset information
 * @throws Error if asset is not supported or found
 */
export function resolveAsset(
  asset: AssetIdentifier,
  chainId: SupportedChainId,
): ResolvedAsset {
  // If it's an address (starts with 0x), validate and find symbol
  if (asset.startsWith('0x')) {
    const address = asset as Address

    // Try to find the symbol for this address
    for (const [, tokenInfo] of Object.entries(SUPPORTED_TOKENS)) {
      const tokenAddress = tokenInfo.addresses[chainId]
      if (
        tokenAddress &&
        tokenAddress.toLowerCase() === address.toLowerCase()
      ) {
        return {
          address: tokenAddress,
          symbol: tokenInfo.symbol,
          decimals: tokenInfo.decimals,
        }
      }
    }

    // If not found in supported tokens, we can't determine decimals
    throw new Error(
      `Unknown asset address: ${address}. Please use a supported asset symbol like 'usdc' or add the token to SUPPORTED_TOKENS.`,
    )
  }

  // If it's a symbol, resolve to address
  const normalizedSymbol = asset.toUpperCase()
  const tokenInfo = SUPPORTED_TOKENS[normalizedSymbol]

  if (!tokenInfo) {
    const availableSymbols = Object.keys(SUPPORTED_TOKENS).join(', ')
    throw new Error(
      `Unsupported asset symbol: ${asset}. Supported assets: ${availableSymbols}`,
    )
  }

  const address = getTokenAddress(normalizedSymbol, chainId)
  if (!address) {
    throw new Error(
      `Asset ${asset} is not supported on chain ${chainId}. Available chains: ${Object.keys(tokenInfo.addresses).join(', ')}`,
    )
  }

  return {
    address,
    symbol: tokenInfo.symbol,
    decimals: tokenInfo.decimals,
  }
}

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
 * Validate and parse lend parameters
 * @param amount - Human-readable amount
 * @param asset - Asset identifier
 * @param chainId - Chain ID
 * @returns Parsed lend parameters
 */
export function parseLendParams(
  amount: number,
  asset: AssetIdentifier,
  chainId: SupportedChainId,
): {
  amount: bigint
  asset: ResolvedAsset
} {
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }

  const resolvedAsset = resolveAsset(asset, chainId)
  const parsedAmount = parseAssetAmount(amount, resolvedAsset.decimals)

  return {
    amount: parsedAmount,
    asset: resolvedAsset,
  }
}

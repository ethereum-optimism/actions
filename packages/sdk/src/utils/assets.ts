import type { Address } from 'viem'
import { parseUnits } from 'viem'
import { base, baseSepolia, mainnet, unichain } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { getTokenAddress, SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type { Asset } from '@/types/token.js'

/**
 * Asset identifier - can be a symbol (like 'usdc'), address, or Asset object
 */
export type AssetIdentifier = string | Address | Asset

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
 * @param asset - Asset symbol (e.g. 'usdc'), address, or Asset object
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

// Asset definitions using the new Asset interface
export const ETH: Asset = {
  address: {
    [mainnet.id]: 'native',
    [unichain.id]: 'native',
    [base.id]: 'native',
    [baseSepolia.id]: 'native',
  },
  metadata: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  type: 'native',
}

export const USDC: Asset = {
  address: {
    [mainnet.id]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    [unichain.id]: '0x078d782b760474a361dda0af3839290b0ef57ad6',
    [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  metadata: {
    decimals: 6,
    name: 'USDC',
    symbol: 'USDC',
  },
  type: 'erc20',
}

export const USDC_DEMO: Asset = {
  address: {
    [baseSepolia.id]: '0x87c25229afbc30418d0144e8dfb2bcf8efd92c6c',
  },
  metadata: {
    decimals: 6,
    name: 'USDC Demo',
    symbol: 'USDC_DEMO',
  },
  type: 'erc20',
}

export const MORPHO: Asset = {
  address: {
    [mainnet.id]: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2',
    [base.id]: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
  },
  metadata: {
    decimals: 18,
    name: 'Morpho Token',
    symbol: 'MORPHO',
  },
  type: 'erc20',
}

/**
 * Get asset address for a specific chain
 * @param asset - Asset definition
 * @param chainId - Chain ID
 * @returns Asset address or null if not supported on that chain
 */
export function getAssetAddress(
  asset: Asset,
  chainId: SupportedChainId,
): Address | 'native' | null {
  return asset.address[chainId] || null
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

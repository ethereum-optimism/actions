import type { Address } from 'viem'

export interface TokenInfo {
  symbol: string
  name: string
  decimals: number
  addresses: Record<number, Address> // chainId -> address
}

export const SUPPORTED_TOKENS: Record<string, TokenInfo> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addresses: {
      1: '0xA0b86a33E6416eFB1e57D696bDc080e07a4aE3d1', // Ethereum
      130: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Unichain
    },
  },
  MORPHO: {
    symbol: 'MORPHO',
    name: 'Morpho Token',
    decimals: 18,
    addresses: {
      1: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2', // Ethereum
      130: '0x078D782b760474a361dDA0AF3839290b0EF57AD6', // Unichain
    },
  },
}

/**
 * Find token by address and chain ID
 * @param address Token address
 * @param chainId Chain ID
 * @returns Token symbol or null if not found
 */
export function findTokenByAddress(
  address: Address,
  chainId: number,
): string | null {
  const normalizedAddress = address.toLowerCase()

  for (const [symbol, token] of Object.entries(SUPPORTED_TOKENS)) {
    const tokenAddress = token.addresses[chainId]
    if (tokenAddress && tokenAddress.toLowerCase() === normalizedAddress) {
      return symbol
    }
  }

  return null
}

/**
 * Get token address for a specific chain
 * @param symbol Token symbol
 * @param chainId Chain ID
 * @returns Token address or null if not supported on that chain
 */
export function getTokenAddress(
  symbol: string,
  chainId: number,
): Address | null {
  const token = SUPPORTED_TOKENS[symbol]
  return token?.addresses[chainId] || null
}

/**
 * Categorize reward token for APY breakdown
 * @param address Token address
 * @param chainId Chain ID
 * @returns Reward category: 'usdc', 'morpho', or 'other'
 */
export function categorizeRewardToken(
  address: Address,
  chainId: number,
): 'usdc' | 'morpho' | 'other' {
  // Primary categorization by chain ID for rewards
  if (chainId === 1) {
    return 'morpho' // Ethereum-based rewards are MORPHO rewards
  } else if (chainId === 130) {
    return 'usdc' // Unichain-based rewards are USDC rewards
  }

  // Fallback to token address lookup
  const tokenSymbol = findTokenByAddress(address, chainId)
  if (tokenSymbol === 'USDC') {
    return 'usdc'
  } else if (tokenSymbol === 'MORPHO') {
    return 'morpho'
  }

  return 'other'
}

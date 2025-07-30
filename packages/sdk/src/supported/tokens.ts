import type { Address } from 'viem'
import { mainnet, unichain } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

export interface TokenInfo {
  symbol: string
  name: string
  decimals: number
  addresses: Partial<Record<SupportedChainId, Address>> // chainId -> address
}

export const SUPPORTED_TOKENS: Record<string, TokenInfo> = {
  USDC: {
    symbol: 'USDC',
    name: 'USDC',
    decimals: 6,
    addresses: {
      [mainnet.id]: '0xA0b86a33E6416eFB1e57D696bDc080e07a4aE3d1',
      [unichain.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    },
  },
  MORPHO: {
    symbol: 'MORPHO',
    name: 'Morpho Token',
    decimals: 18,
    addresses: {
      [mainnet.id]: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2',
      [unichain.id]: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
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
  chainId: SupportedChainId,
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
  chainId: SupportedChainId,
): Address | null {
  const token = SUPPORTED_TOKENS[symbol]
  return token?.addresses[chainId] || null
}

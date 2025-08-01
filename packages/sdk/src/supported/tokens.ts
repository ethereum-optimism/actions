import type { Address } from 'viem'
import { base, mainnet, unichain } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

export interface TokenInfo {
  symbol: string
  name: string
  decimals: number
  addresses: Partial<Record<SupportedChainId, Address>> // chainId -> address
}

export const SUPPORTED_TOKENS: Record<string, TokenInfo> = {
  ETH: {
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: 18,
    addresses: {
      [mainnet.id]: '0x0000000000000000000000000000000000000000',
      [unichain.id]: '0x0000000000000000000000000000000000000000',
      [base.id]: '0x0000000000000000000000000000000000000000',
    },
  },
  USDC: {
    symbol: 'USDC',
    name: 'USDC',
    decimals: 6,
    addresses: {
      [mainnet.id]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      [unichain.id]: '0x078d782b760474a361dda0af3839290b0ef57ad6',
    },
  },
  MORPHO: {
    symbol: 'MORPHO',
    name: 'Morpho Token',
    decimals: 18,
    addresses: {
      [mainnet.id]: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2',
      [base.id]: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
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

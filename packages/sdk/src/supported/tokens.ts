import type { Address } from 'viem'

import { ETH, MORPHO, USDC, USDC_DEMO, WETH } from '@/constants/assets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

export const SUPPORTED_TOKENS: Asset[] = [ETH, WETH, USDC, USDC_DEMO, MORPHO]

/**
 * Get token by address and chain ID
 * @param address Token address
 * @param chainId Chain ID
 * @returns Token symbol or null if not found
 */
export function getTokenByAddress(
  address: Address,
  chainId: SupportedChainId,
): string | null {
  const normalizedAddress = address.toLowerCase()

  for (const token of SUPPORTED_TOKENS) {
    const tokenAddress = token.address[chainId]
    if (tokenAddress && tokenAddress.toLowerCase() === normalizedAddress) {
      return token.metadata.symbol
    }
  }

  return null
}

/**
 * Get token address for a specific chain
 * @param symbol Token symbol
 * @param chainId Chain ID
 * @returns Token address, 'native' for native assets, or null if not supported
 */
export function getTokenAddress(
  symbol: string,
  chainId: SupportedChainId,
): Address | 'native' | null {
  const token = SUPPORTED_TOKENS.find((t) => t.metadata.symbol === symbol)
  return token?.address[chainId] || null
}

/**
 * Get token by symbol
 * @param symbol Token symbol
 * @returns Asset or null if not found
 */
export function getTokenBySymbol(symbol: string): Asset | null {
  return SUPPORTED_TOKENS.find((t) => t.metadata.symbol === symbol) || null
}

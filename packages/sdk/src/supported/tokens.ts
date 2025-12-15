import type { Address } from 'viem'
import {
  base,
  baseSepolia,
  mainnet,
  optimismSepolia,
  unichain,
} from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

export const SUPPORTED_TOKENS: Asset[] = [
  {
    address: {
      [mainnet.id]: '0x0000000000000000000000000000000000000000',
      [unichain.id]: '0x0000000000000000000000000000000000000000',
      [base.id]: '0x0000000000000000000000000000000000000000',
      [baseSepolia.id]: '0x0000000000000000000000000000000000000000',
      [optimismSepolia.id]: '0x0000000000000000000000000000000000000000',
    },
    metadata: {
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
    },
    type: 'native',
  },
  {
    address: {
      [mainnet.id]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      [base.id]: '0x4200000000000000000000000000000000000006',
      [baseSepolia.id]: '0x4200000000000000000000000000000000000006',
      [optimismSepolia.id]: '0x4200000000000000000000000000000000000006',
      [unichain.id]: '0x4200000000000000000000000000000000000006',
    },
    metadata: {
      symbol: 'WETH',
      name: 'Wrapped Ether',
      decimals: 18,
    },
    type: 'erc20',
  },
  {
    address: {
      [mainnet.id]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      [unichain.id]: '0x078d782b760474a361dda0af3839290b0ef57ad6',
      [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
    metadata: {
      symbol: 'USDC',
      name: 'USDC',
      decimals: 6,
    },
    type: 'erc20',
  },
  {
    address: {
      [baseSepolia.id]: '0xb1b0FE886cE376F28987Ad24b1759a8f0A7dd839',
    },
    metadata: {
      symbol: 'USDC_DEMO',
      name: 'USDC',
      decimals: 6,
    },
    type: 'erc20',
  },
  {
    address: {
      [mainnet.id]: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2',
      [base.id]: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
    },
    metadata: {
      symbol: 'MORPHO',
      name: 'Morpho Token',
      decimals: 18,
    },
    type: 'erc20',
  },
]

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
 * @returns Token address or null if not supported on that chain
 */
export function getTokenAddress(
  symbol: string,
  chainId: SupportedChainId,
): Address | null {
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

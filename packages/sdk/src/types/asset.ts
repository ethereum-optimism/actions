import type { Address } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Asset type inspired by EIP 7811 but adapted for multi-chain asset definitions
 */
export interface Asset {
  /** Multi-chain address mapping */
  address: Partial<Record<SupportedChainId, Address>>
  /** Asset metadata */
  metadata: {
    decimals: number
    name: string
    symbol: string
  }
  /** Asset type for proper handling */
  type: 'native' | 'erc20'
}

/**
 * Detailed token balance information
 */
export interface TokenBalance {
  symbol: string
  totalBalance: bigint
  totalFormattedBalance: string
  chainBalances: Array<{
    chainId: SupportedChainId
    balance: bigint
    tokenAddress: Address
    formattedBalance: string
  }>
}

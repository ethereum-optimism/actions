import type { SupportedChainId } from '@/constants/supportedChains.js'

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
    formattedBalance: string
  }>
}

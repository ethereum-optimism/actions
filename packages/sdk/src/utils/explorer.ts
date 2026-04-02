import { chainById } from '@eth-optimism/viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Get block explorer URL for a transaction
 * @param chainId - Chain ID
 * @param txHash - Transaction hash
 * @returns Explorer URL or undefined if chain has no configured explorer
 * @example
 * ```typescript
 * const url = getExplorerUrl(10, '0x1234...abcd')
 * // Returns: "https://optimistic.etherscan.io/tx/0x1234...abcd"
 * ```
 */
export function getExplorerUrl(
  chainId: SupportedChainId,
  txHash: string,
): string | undefined {
  const chain = chainById[chainId]
  const explorerUrl = chain?.blockExplorers?.default?.url

  if (!explorerUrl) {
    return undefined
  }

  return `${explorerUrl}/tx/${txHash}`
}

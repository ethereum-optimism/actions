import { chainById } from '@eth-optimism/viem/chains'
import * as viemChains from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

/** Fallback explorer URLs for chains not in @eth-optimism/viem/chains */
const viemChainById = Object.fromEntries(
  Object.values(viemChains)
    .filter((c): c is viemChains.Chain => typeof c === 'object' && 'id' in c)
    .map((c) => [c.id, c]),
)

/**
 * Get block explorer URL for a transaction
 * @param chainId - Chain ID
 * @param txHash - Transaction hash
 * @returns Explorer URL or undefined if chain has no configured explorer
 * @example
 * ```typescript
 * const url = getExplorerUrl(10, '0x1234...abcd')
 * // Returns: "https://explorer.optimism.io/tx/0x1234...abcd"
 * ```
 */
export function getExplorerUrl(
  chainId: SupportedChainId,
  txHash: string,
): string | undefined {
  // Try OP Stack chains first, then fall back to viem chains
  const chain = chainById[chainId] ?? viemChainById[chainId]
  const explorerUrl = chain?.blockExplorers?.default?.url

  if (!explorerUrl) {
    return undefined
  }

  return `${explorerUrl}/tx/${txHash}`
}

import type { Hex } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { getSupportedChain } from '@/constants/supportedChains.js'

export interface ExplorerUrlParams {
  chainId: SupportedChainId
  userOpHash?: Hex | string
  transactionHash?: Hex | string
  transactionHashes?: readonly (Hex | string)[]
}

/**
 * Resolve the default block-explorer origin for a supported chain.
 * Uses the chain's viem `blockExplorers.default.url` when present.
 */
export function getBlockExplorerBaseUrl(chainId: SupportedChainId): string {
  const chain = getSupportedChain(chainId)
  const url = chain?.blockExplorers?.default?.url
  if (!url) {
    throw new Error(`Block explorer not configured for chainId: ${chainId}`)
  }
  return url.replace(/\/$/, '')
}

export function getTransactionUrl(
  chainId: SupportedChainId,
  transactionHash: string,
): string {
  return `${getBlockExplorerBaseUrl(chainId)}/tx/${transactionHash}`
}

export function getUserOperationUrl(
  chainId: SupportedChainId,
  userOpHash: string,
): string {
  return `${getBlockExplorerBaseUrl(chainId)}/op/${userOpHash}`
}

/**
 * Build block-explorer URL(s) for a dispatched action receipt.
 * Prefers userOpHash, then batched transactionHashes, then a single hash.
 */
export function getBlockExplorerUrls(params: ExplorerUrlParams): string[] {
  const { chainId, userOpHash, transactionHash, transactionHashes } = params
  if (userOpHash) {
    return [getUserOperationUrl(chainId, userOpHash)]
  }
  if (transactionHashes && transactionHashes.length > 0) {
    return transactionHashes.map((hash) => getTransactionUrl(chainId, hash))
  }
  if (transactionHash) {
    return [getTransactionUrl(chainId, transactionHash)]
  }
  return []
}

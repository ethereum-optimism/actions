import type {
  SupportedChainId,
  LendTransactionReceipt,
} from '@eth-optimism/actions-sdk'
import { baseSepolia, optimismSepolia } from 'viem/chains'

const BLOCK_EXPLORER_URLS: Record<number, string> = {
  [baseSepolia.id]: 'https://base-sepolia.blockscout.com',
  [optimismSepolia.id]: 'https://optimism-sepolia.blockscout.com',
}

/**
 * Extract transaction hash and userOp hash from a LendTransactionReceipt
 */
export function extractHashes(result: LendTransactionReceipt): {
  txHash?: string
  userOpHash?: string
} {
  const userOpHash = 'userOpHash' in result ? result.userOpHash : undefined
  const txHash = Array.isArray(result)
    ? result[0]?.transactionHash
    : 'receipt' in result
      ? result.receipt.transactionHash
      : result.transactionHash

  return { txHash, userOpHash }
}

/**
 * Get block explorer URL for a transaction result
 */
export function getBlockExplorerUrl(
  chainId: SupportedChainId,
  result: LendTransactionReceipt,
): string | undefined {
  const baseUrl = BLOCK_EXPLORER_URLS[chainId]
  if (!baseUrl) {
    console.warn(`Block explorer not configured for chainId: ${chainId}`)
    return undefined
  }

  const { txHash, userOpHash } = extractHashes(result)

  if (userOpHash) {
    return `${baseUrl}/op/${userOpHash}`
  }
  if (txHash) {
    return `${baseUrl}/tx/${txHash}`
  }
  return undefined
}

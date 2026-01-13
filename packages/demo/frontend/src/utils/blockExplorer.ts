import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import { baseSepolia, optimismSepolia } from 'viem/chains'

const BLOCK_EXPLORER_URLS: Record<number, string> = {
  [baseSepolia.id]: 'https://base-sepolia.blockscout.com',
  [optimismSepolia.id]: 'https://optimism-sepolia.blockscout.com',
}

/**
 * Get block explorer URLs for transaction hashes or user operation hash
 */
export async function getBlockExplorerUrls(
  chainId: SupportedChainId,
  transactionHashes?: string[],
  userOpHash?: string,
): Promise<string[]> {
  const url = BLOCK_EXPLORER_URLS[chainId]
  if (!url) {
    console.warn(`Block explorer not configured for chainId: ${chainId}`)
    return []
  }

  if (userOpHash) {
    return [`${url}/op/${userOpHash}`]
  }
  if (transactionHashes && transactionHashes.length > 0) {
    return transactionHashes.map((hash) => `${url}/tx/${hash}`)
  }
  return []
}

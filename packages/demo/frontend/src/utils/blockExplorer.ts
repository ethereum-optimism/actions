import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import { baseSepolia, chainById, unichain } from '@eth-optimism/viem/chains'

/**
 * Get block explorer URLs for transaction hashes or user operation hash
 */
export async function getBlockExplorerUrls(
  chainId: SupportedChainId,
  transactionHashes?: string[],
  userOpHash?: string,
): Promise<string[]> {
  const chain = chainById[chainId]
  if (!chain) {
    throw new Error(`Chain not found for chainId: ${chainId}`)
  }

  let url = `${chain.blockExplorers?.default.url}`
  if (chain.id === unichain.id) {
    url = `https://unichain.blockscout.com`
  }
  if (chain.id === baseSepolia.id) {
    url = `https://base-sepolia.blockscout.com`
  }

  if (userOpHash) {
    return [`${url}/op/${userOpHash}`]
  }
  if (!transactionHashes) {
    throw new Error('Transaction hashes not found')
  }
  return transactionHashes.map((hash) => `${url}/tx/${hash}`)
}

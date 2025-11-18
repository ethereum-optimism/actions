import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import { baseSepolia, optimismSepolia, unichain } from 'viem/chains'

function getBlockExplorerBaseUrl(chainId: SupportedChainId): string {
  const blockExplorerUrls: Record<number, string> = {
    [unichain.id]: 'https://unichain.blockscout.com',
    [baseSepolia.id]: 'https://base-sepolia.blockscout.com',
    [optimismSepolia.id]: 'https://optimism-sepolia.blockscout.com',
  }

  const url = blockExplorerUrls[chainId]
  if (!url) {
    throw new Error(`Block explorer not configured for chainId: ${chainId}`)
  }

  return url
}

export function getTransactionUrl(
  chainId: SupportedChainId,
  transactionHash: string,
): string {
  const baseUrl = getBlockExplorerBaseUrl(chainId)
  return `${baseUrl}/tx/${transactionHash}`
}

export function getUserOperationUrl(
  chainId: SupportedChainId,
  userOpHash: string,
): string {
  const baseUrl = getBlockExplorerBaseUrl(chainId)
  return `${baseUrl}/op/${userOpHash}`
}

export function getBlockExplorerUrls(params: {
  chainId: SupportedChainId
  userOpHash?: string
  transactionHash?: string
  transactionHashes?: string[]
}): string[] {
  const { chainId, userOpHash, transactionHash, transactionHashes } = params
  const blockExplorerUrls: string[] = []
  if (userOpHash) {
    blockExplorerUrls.push(getUserOperationUrl(chainId, userOpHash))
  } else if (transactionHashes && transactionHashes.length > 0) {
    blockExplorerUrls.push(
      ...transactionHashes.map((hash) => getTransactionUrl(chainId, hash)),
    )
  } else if (transactionHash) {
    blockExplorerUrls.push(getTransactionUrl(chainId, transactionHash))
  }
  return blockExplorerUrls
}

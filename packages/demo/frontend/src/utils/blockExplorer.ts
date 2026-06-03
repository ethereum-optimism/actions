import type {
  BorrowReceipt,
  SupportedChainId,
  LendTransactionReceipt,
} from '@eth-optimism/actions-sdk'
import { baseSepolia, optimismSepolia } from 'viem/chains'

const BLOCK_EXPLORER_URLS: Record<number, string> = {
  [baseSepolia.id]: 'https://base-sepolia.blockscout.com',
  [optimismSepolia.id]: 'https://optimism-sepolia.blockscout.com',
}

/**
 * Receipt shapes that carry tx hash data and can be linked from the UI.
 * Borrow's receipt denormalizes `transactionHash` / `transactionHashes`
 * / `userOpHash` onto the envelope (PR #3 contract); the existing
 * extractHashes branches already cover the lend / borrow / smart-wallet
 * variants via duck typing.
 */
export type LinkableReceipt = LendTransactionReceipt | BorrowReceipt

/**
 * Extract transaction hash and userOp hash from a receipt
 */
export function extractHashes(result: LinkableReceipt): {
  txHash?: string
  userOpHash?: string
} {
  const userOpHash = 'userOpHash' in result ? result.userOpHash : undefined
  const txHash = Array.isArray(result)
    ? result[0]?.transactionHash
    : 'receipt' in result &&
        result.receipt &&
        typeof result.receipt === 'object' &&
        'transactionHash' in result.receipt
      ? (result.receipt as { transactionHash?: string }).transactionHash
      : 'transactionHash' in result
        ? result.transactionHash
        : undefined

  return { txHash, userOpHash }
}

/**
 * Get block explorer URL for a transaction result
 */
export function getBlockExplorerUrl(
  chainId: SupportedChainId,
  result: LinkableReceipt,
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

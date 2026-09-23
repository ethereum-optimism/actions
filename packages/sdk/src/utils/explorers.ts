import type { Hex } from 'viem'

import {
  getSupportedChain,
  type SupportedChainId,
} from '@/constants/supportedChains.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

/**
 * Resolve a chain's canonical block-explorer base URL.
 * @description Reads viem's chain definition rather than keeping a
 * hand-maintained map; every chain in `SUPPORTED_CHAINS` ships a
 * `blockExplorers.default`.
 * @param chainId - Chain to resolve.
 * @returns Base URL without a trailing slash, or `undefined` when the chain
 * definition carries no explorer.
 */
export function getBlockExplorerBaseUrl(
  chainId: SupportedChainId,
): string | undefined {
  const url = getSupportedChain(chainId)?.blockExplorers?.default.url
  return url?.replace(/\/+$/, '')
}

/**
 * Build block-explorer URLs for the transaction(s) behind an action receipt.
 * @description Every URL is a `/tx/` link, which resolves on all supported
 * chains. Returns `[]` rather than throwing when a chain carries no explorer:
 * a decorator on a settled receipt must not fail an action that already
 * landed on-chain.
 * @param receipt - Receipt returned by a wallet send or sendBatch call.
 * @param chainId - Chain the receipt was produced on.
 * @returns One URL per transaction, in dispatch order.
 */
export function getBlockExplorerUrls(
  receipt: TransactionReturnType | BatchTransactionReturnType,
  chainId: SupportedChainId,
): string[] {
  const baseUrl = getBlockExplorerBaseUrl(chainId)
  if (!baseUrl) {
    return []
  }
  return receiptTransactionHashes(receipt).map(
    (hash) => `${baseUrl}/tx/${hash}`,
  )
}

/**
 * Transaction hash(es) an explorer can resolve for a wallet receipt.
 * @description Mirrors the union split in `extractReceiptHashes`, but for
 * ERC-4337 returns the hash of the transaction that *included* the
 * UserOperation instead of the `userOpHash`. A `userOpHash` is not a
 * transaction hash, and only Blockscout-family explorers route it (`/op/`);
 * the including transaction resolves everywhere.
 *
 * Hashes are read defensively and missing ones are dropped: the same
 * default-deny stance `ensureOnchainSuccess` takes on receipt shapes from a
 * misbehaving RPC. Link decoration must never throw over a transaction that
 * already landed.
 */
function receiptTransactionHashes(
  receipt: TransactionReturnType | BatchTransactionReturnType,
): Hex[] {
  if (Array.isArray(receipt)) {
    return receipt.map((r) => r?.transactionHash).filter(isHex)
  }
  if ('userOpHash' in receipt) {
    return [receipt.receipt?.transactionHash].filter(isHex)
  }
  return [receipt.transactionHash].filter(isHex)
}

function isHex(value: Hex | undefined): value is Hex {
  return typeof value === 'string'
}

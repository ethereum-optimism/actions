import { baseSepolia, unichain } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import {
  SUPPORTED_CHAIN_IDS,
  type SupportedChainId,
} from '@/constants/supportedChains.js'
import {
  getBlockExplorerBaseUrl,
  getBlockExplorerUrls,
} from '@/utils/explorers.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

const TX_HASH_A =
  '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TX_HASH_B =
  '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const USER_OP_HASH =
  '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

const eoaReceipt = (transactionHash: string): TransactionReturnType =>
  ({ transactionHash }) as unknown as TransactionReturnType

const userOpReceipt = (
  userOpHash: string,
  includedIn: string,
): TransactionReturnType =>
  ({
    userOpHash,
    receipt: { transactionHash: includedIn },
  }) as unknown as TransactionReturnType

describe('getBlockExplorerBaseUrl', () => {
  it('reads the explorer from the viem chain definition', () => {
    expect(getBlockExplorerBaseUrl(baseSepolia.id)).toBe(
      'https://sepolia.basescan.org',
    )
    expect(getBlockExplorerBaseUrl(unichain.id)).toBe('https://uniscan.xyz')
  })

  it('returns undefined for a chain the SDK does not support', () => {
    expect(getBlockExplorerBaseUrl(999_999 as SupportedChainId)).toBeUndefined()
  })
})

describe('getBlockExplorerUrls', () => {
  it('links a single EOA transaction', () => {
    expect(getBlockExplorerUrls(eoaReceipt(TX_HASH_A), baseSepolia.id)).toEqual(
      [`https://sepolia.basescan.org/tx/${TX_HASH_A}`],
    )
  })

  it('links every transaction of an EOA batch, in dispatch order', () => {
    const batch = [
      eoaReceipt(TX_HASH_A),
      eoaReceipt(TX_HASH_B),
    ] as unknown as BatchTransactionReturnType

    expect(getBlockExplorerUrls(batch, unichain.id)).toEqual([
      `https://uniscan.xyz/tx/${TX_HASH_A}`,
      `https://uniscan.xyz/tx/${TX_HASH_B}`,
    ])
  })

  it('links the including transaction for a UserOperation, not the userOpHash', () => {
    const urls = getBlockExplorerUrls(
      userOpReceipt(USER_OP_HASH, TX_HASH_A),
      baseSepolia.id,
    )

    expect(urls).toEqual([`https://sepolia.basescan.org/tx/${TX_HASH_A}`])
    expect(urls[0]).not.toContain(USER_OP_HASH)
  })

  it('returns an empty list instead of throwing when no explorer is known', () => {
    expect(
      getBlockExplorerUrls(eoaReceipt(TX_HASH_A), 999_999 as SupportedChainId),
    ).toEqual([])
  })

  it('drops missing hashes rather than throwing on a malformed receipt', () => {
    const noIncludingTx = {
      userOpHash: USER_OP_HASH,
    } as unknown as TransactionReturnType

    expect(getBlockExplorerUrls(noIncludingTx, baseSepolia.id)).toEqual([])
  })

  it('produces a well-formed url for every supported chain', () => {
    for (const chainId of SUPPORTED_CHAIN_IDS) {
      const [url] = getBlockExplorerUrls(eoaReceipt(TX_HASH_A), chainId)
      expect(url, `chainId ${chainId}`).toBe(
        `${getBlockExplorerBaseUrl(chainId)}/tx/${TX_HASH_A}`,
      )
      expect(url, `chainId ${chainId}`).toMatch(
        /^https:\/\/[^/]+(\/[^/]+)*\/tx\/0x[0-9a-f]{64}$/,
      )
    }
  })
})

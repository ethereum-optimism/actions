/**
 * Network fork test for EOAWallet.sendBatch.
 *
 * Forks baseSepolia via anvil and submits a real batch of transactions
 * through a LocalWallet, asserting the pipelined `sendBatch`
 * (sequential broadcast + parallel receipt waits) produces correct receipts
 * in input order with strictly sequential nonces.
 *
 * Run: pnpm test:network
 * Requires: anvil (foundry) on PATH; network access. Optionally set
 * BASE_SEPOLIA_RPC; defaults to https://sepolia.base.org. Anvil pre-funds its
 * default dev accounts (10000 ETH) on forks, so no live funding is needed.
 */
import {
  type Address,
  getAddress,
  type Hex,
  parseEther,
  type TransactionReceipt,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { TransactionData } from '@/types/lend/index.js'
import {
  ANVIL_ACCOUNTS,
  type AnvilFork,
  startAnvilFork,
  stopAnvilFork,
} from '@/utils/test.js'
import { LocalWallet } from '@/wallet/node/wallets/local/LocalWallet.js'

const BASE_SEPOLIA_ID = baseSepolia.id as SupportedChainId
const BASE_SEPOLIA_RPC =
  process.env.BASE_SEPOLIA_RPC ?? 'https://sepolia.base.org'
const ANVIL_PORT = 8561

// Three distinct recipients so we can assert receipts map back to inputs in order.
const RECIPIENTS: Address[] = [
  getAddress('0x000000000000000000000000000000000000dead'),
  getAddress('0x000000000000000000000000000000000000beef'),
  getAddress('0x000000000000000000000000000000000000cafe'),
]

describe('EOAWallet.sendBatch (network fork)', () => {
  let fork: AnvilFork
  let wallet: LocalWallet
  let chainManager: ChainManager

  beforeAll(async () => {
    fork = await startAnvilFork(BASE_SEPOLIA_RPC, ANVIL_PORT)
    chainManager = new ChainManager([
      { chainId: BASE_SEPOLIA_ID, rpcUrls: [fork.rpcUrl] },
    ])
    const account = privateKeyToAccount(ANVIL_ACCOUNTS.ACCOUNT_0)
    wallet = await LocalWallet.create({
      account,
      chainManager,
      actionProviders: {},
      actionSettings: {},
    })
  }, 60_000)

  afterAll(() => {
    if (fork) stopAnvilFork(fork)
  })

  it('produces correct receipts in input order for a batched send', async () => {
    const txs: TransactionData[] = RECIPIENTS.map((to) => ({
      to,
      value: parseEther('0.001'),
      data: '0x' as Hex,
    }))

    const receipts = await wallet.sendBatch(txs, BASE_SEPOLIA_ID)

    expect(receipts).toHaveLength(RECIPIENTS.length)

    // Each receipt maps back to its input transaction in order, mined
    // successfully.
    receipts.forEach((receipt: TransactionReceipt, i) => {
      expect(receipt.status).toBe('success')
      expect(receipt.to?.toLowerCase()).toBe(RECIPIENTS[i].toLowerCase())
    })

    // Hashes are distinct (no accidental duplicate submission).
    const hashes = new Set(receipts.map((r) => r.transactionHash))
    expect(hashes.size).toBe(RECIPIENTS.length)

    // Nonces are strictly sequential in submission order, proving the
    // sequential-broadcast invariant held against a real RPC.
    const publicClient = chainManager.getPublicClient(BASE_SEPOLIA_ID)
    const nonces = await Promise.all(
      receipts.map(async (r) => {
        const tx = await publicClient.getTransaction({
          hash: r.transactionHash,
        })
        return tx.nonce
      }),
    )
    nonces.forEach((nonce, i) => {
      if (i > 0) expect(nonce).toBe(nonces[i - 1] + 1)
    })
  }, 60_000)
})

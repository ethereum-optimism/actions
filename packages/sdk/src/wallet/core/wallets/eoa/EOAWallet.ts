import type {
  Chain,
  FallbackTransport,
  Hex,
  HttpTransport,
  LocalAccount,
  WalletClient,
} from 'viem'
import { createWalletClient, nonceManager } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { TransactionData } from '@/types/lend/index.js'
import type { EOATransactionReceipt } from '@/wallet/core/wallets/abstract/types/index.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Base class for Externally Owned Account (EOA) wallets.
 *
 * EOA wallets send standard Ethereum transactions signed by a private key,
 * without using ERC-4337 account abstraction features (bundlers, UserOperations, paymasters).
 * Transactions are submitted directly to the network and processed by validators.
 */
export abstract class EOAWallet extends Wallet {
  /**
   * Create a WalletClient for this EOA wallet.
   *
   * Attaches viem's default `nonceManager` to the signer so back-to-back
   * `sendTransaction` calls receive sequential nonces without re-fetching
   * `eth_getTransactionCount('pending')` per tx. This avoids races on
   * load-balanced RPCs where pending state lags by one block.
   * @param chainId - The chain ID to create the wallet client for
   * @returns Promise resolving to a WalletClient configured for the specified chain
   */
  async walletClient(
    chainId: SupportedChainId,
  ): Promise<
    WalletClient<
      | HttpTransport<undefined, false>
      | FallbackTransport<Array<HttpTransport<undefined, false>>>,
      Chain,
      LocalAccount,
      []
    >
  > {
    const account: LocalAccount = this.signer.nonceManager
      ? this.signer
      : { ...this.signer, nonceManager }
    return createWalletClient({
      account,
      chain: this.chainManager.getChain(chainId),
      transport: this.chainManager.getTransportForChain(chainId),
    })
  }

  /**
   * Send a single transaction from this EOA wallet.
   *
   * Creates a wallet client, sends the transaction, and waits for the receipt.
   * @param transactionData - Transaction to send (to, value, data, etc.)
   * @param chainId - Chain to send the transaction on
   * @returns Promise resolving to the transaction receipt
   */
  async send(
    transactionData: TransactionData,
    chainId: SupportedChainId,
  ): Promise<EOATransactionReceipt> {
    const walletClient = await this.walletClient(chainId)
    const txHash = await walletClient.sendTransaction(transactionData)
    const publicClient = this.chainManager.getPublicClient(chainId)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
    })
    return receipt
  }

  /**
   * Send multiple transactions from this EOA wallet, pipelining the receipt
   * waits.
   *
   * Transactions are broadcast sequentially but their receipts are awaited in
   * parallel. Each tx is signed and submitted one after another (awaiting each
   * broadcast before the next): the `nonceManager` attached in `walletClient()`
   * assigns sequential nonces, and broadcasting in order guarantees tx `i` gets
   * nonce `N+i` and reaches the mempool before tx `i+1` is sent. Submission is
   * cheap (sign + `eth_sendRawTransaction`). All receipts are then awaited
   * together via `Promise.all`; the receipt wait (~one block per tx) is the
   * dominant cost, so overlapping the waits collapses `M` sequential waits into
   * roughly a single wait — the perf win this method exists for.
   *
   * Receipts are returned in input order: `receipts[i]` corresponds to
   * `transactionData[i]`.
   *
   * Why not broadcast in parallel too? viem's `nonceManager` only guarantees
   * each `sendTransaction` consumes a unique nonce, not that the nonce order
   * follows array order when sends race (the nonce is consumed after each
   * call's async preparation, which can interleave). Broadcasting in parallel
   * could therefore assign nonce `N` to the swap and `N+1` to its approval,
   * reverting the swap. Sequential broadcast keeps on-chain execution order
   * aligned with array order, which ordered batches (e.g. `[approve, swap]`)
   * depend on. The skipped parallelism only covers the cheap submission RPCs,
   * not the expensive waits, so the perf cost is negligible.
   *
   * Failure semantics, relative to the previous fully-sequential
   * implementation that awaited each receipt before broadcasting the next:
   *
   * A broadcast that throws (e.g. insufficient funds, RPC rejection) rejects
   * the whole batch immediately. Transactions already broadcast are not rolled
   * back and will still be mined; transactions not yet reached are never sent.
   * This matches the previous behaviour.
   *
   * A reverted-but-mined transaction does not throw (`waitForTransactionReceipt`
   * resolves with `status: 'reverted'`) and does not stop later transactions —
   * they were already broadcast with valid sequential nonces and will execute
   * regardless. Callers must inspect each returned receipt's `status`. The
   * previous implementation did not gate on revert either, so it also let later
   * txs land after an earlier revert.
   *
   * An earlier transaction that is broadcast but never mined (dropped or stuck)
   * leaves later transactions stuck behind the nonce gap, because they have
   * already been submitted. The previous implementation would have blocked at
   * the earlier tx's receipt wait and never submitted the later ones. This is
   * the one genuine behavioural change to be aware of.
   *
   * Note: this method assumes a sequencer-ordered chain (e.g. OP-stack L2s).
   * On chains with deeper reorg risk, consider an additional confirmations
   * pass at the call site.
   * @param transactionData - Array of transactions to send
   * @param chainId - Chain to send the transactions on
   * @returns Promise resolving to array of transaction receipts (one per transaction, in input order)
   */
  async sendBatch(
    transactionData: readonly TransactionData[],
    chainId: SupportedChainId,
  ): Promise<EOATransactionReceipt[]> {
    const walletClient = await this.walletClient(chainId)
    const publicClient = this.chainManager.getPublicClient(chainId)

    const hashes: Hex[] = []
    for (const tx of transactionData) {
      hashes.push(await walletClient.sendTransaction(tx))
    }

    return Promise.all(
      hashes.map((hash) => publicClient.waitForTransactionReceipt({ hash })),
    )
  }
}

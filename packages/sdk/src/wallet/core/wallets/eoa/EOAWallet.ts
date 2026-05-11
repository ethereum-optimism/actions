import type {
  Chain,
  FallbackTransport,
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
   * Send multiple transactions sequentially from this EOA wallet.
   *
   * Each transaction is awaited to inclusion (one confirmation) via `send()`
   * before the next is signed. The `nonceManager` attached in `walletClient()`
   * keeps nonces in sequence locally, so the wait does not need extra
   * confirmations to guarantee nonce monotonicity.
   *
   * Note: this method assumes a sequencer-ordered chain (e.g. OP-stack L2s).
   * On chains with deeper reorg risk, consider an additional confirmations
   * pass at the call site.
   * @param transactionData - Array of transactions to send
   * @param chainId - Chain to send the transactions on
   * @returns Promise resolving to array of transaction receipts (one per transaction)
   */
  async sendBatch(
    transactionData: readonly TransactionData[],
    chainId: SupportedChainId,
  ): Promise<EOATransactionReceipt[]> {
    const receipts: EOATransactionReceipt[] = []
    for (const tx of transactionData) {
      const receipt = await this.send(tx, chainId)
      receipts.push(receipt)
    }
    return receipts
  }
}

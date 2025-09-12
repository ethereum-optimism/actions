import type { Address, Hash, WalletClient } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { WalletLendNamespace } from '@/lend/namespaces/WalletLendNamespace.js'
import type { TransactionData } from '@/types/lend.js'
import type { AssetIdentifier } from '@/utils/assets.js'
import { Wallet } from '@/wallet/base/Wallet.js'

/**
 * Base smart wallet class
 * @description Abstract base class for smart wallet implementations (ERC-4337 compatible wallets).
 */
export abstract class SmartWallet extends Wallet {
  /** Lend namespace with all lending operations */
  abstract lend: WalletLendNamespace

  async walletClient(_chainId: SupportedChainId): Promise<WalletClient> {
    throw new Error('walletClient is not supported on SmartWallet')
  }

  // TODO: add addSigner method
  // TODO: add removeSigner method

  /**
   * Send a transaction using this smart wallet
   * @description Executes a transaction through the smart wallet, handling gas sponsorship
   * and ERC-4337 UserOperation creation automatically.
   * @param transactionData - The transaction data to execute
   * @param chainId - Target blockchain chain ID
   * @returns Promise resolving to the transaction hash
   */
  abstract send(
    transactionData: TransactionData,
    chainId: SupportedChainId,
  ): Promise<Hash>

  /**
   * Send a batch of transactions using this smart wallet
   * @description Executes a batch of transactions through the smart wallet, handling gas sponsorship
   * and ERC-4337 UserOperation creation automatically.
   * @param transactionData - The transaction data to execute
   * @param chainId
   */
  abstract sendBatch(
    transactionData: TransactionData[],
    chainId: SupportedChainId,
  ): Promise<Hash>

  /**
   * Send tokens to another address
   * @description Prepares transaction data for sending tokens from this smart wallet
   * to a recipient address. Returns transaction data that can be executed via send().
   * @param amount - Amount to send in human-readable format
   * @param asset - Asset identifier for the token to send
   * @param recipientAddress - Destination address for the tokens
   * @returns Promise resolving to prepared transaction data
   */
  abstract sendTokens(
    amount: number,
    asset: AssetIdentifier,
    recipientAddress: Address,
  ): Promise<TransactionData>
}

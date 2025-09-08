import type { Address, Hash, WalletClient } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  LendOptions,
  LendTransaction,
  TransactionData,
} from '@/types/lend.js'
import type { TokenBalance } from '@/types/token.js'
import type { AssetIdentifier } from '@/utils/assets.js'
import { VerbsWallet } from '@/wallet/base/VerbsWallet.js'

/**
 * Base smart wallet class
 * @description Abstract base class for smart wallet implementations (ERC-4337 compatible wallets).
 */
export abstract class SmartWallet extends VerbsWallet {
  async walletClient(_chainId: SupportedChainId): Promise<WalletClient> {
    throw new Error('walletClient is not supported on SmartWallet')
  }

  /**
   * Get all token balances for this wallet
   * @description Retrieves balances for all supported tokens held by this smart wallet.
   * @returns Promise resolving to an array of token balances with amounts and metadata
   */
  abstract getBalance(): Promise<TokenBalance[]>

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
   * Lend tokens to a lending protocol
   * @description Deposits tokens into a lending market to earn yield.
   * Handles token approvals, market selection, and transaction execution.
   * @param amount - Amount to lend in human-readable format
   * @param asset - Asset identifier for the token to lend
   * @param chainId - Target blockchain chain ID
   * @param marketId - Optional specific market ID (auto-selected if not provided)
   * @param options - Optional lending configuration (slippage, etc.)
   * @returns Promise resolving to lending transaction details
   */
  abstract lend(
    amount: number,
    asset: AssetIdentifier,
    chainId: SupportedChainId,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction>

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

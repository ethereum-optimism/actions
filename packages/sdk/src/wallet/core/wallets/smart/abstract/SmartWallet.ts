import type { Address, WalletClient } from 'viem'
import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { TransactionData } from '@/types/lend/index.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'

/**
 * Base smart wallet class
 * @description Abstract base class for smart wallet implementations (ERC-4337 compatible wallets).
 */
export abstract class SmartWallet extends Wallet {
  async walletClient(_chainId: SupportedChainId): Promise<WalletClient> {
    throw new Error('walletClient is not supported on SmartWallet')
  }

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
  ): Promise<WaitForUserOperationReceiptReturnType>

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
  ): Promise<WaitForUserOperationReceiptReturnType>

  /**
   * Add a new signer to the smart wallet
   * @description Adds either an EOA address signer or a WebAuthn account signer
   * to the underlying smart wallet contract.
   * @param signer - Ethereum address (EOA) or a `WebAuthnAccount` to add
   * @param chainId - Target chain on which the smart wallet operates
   * @returns Promise resolving to the onchain signer index for the newly added signer
   * @throws Error if the add operation fails or the owner index cannot be found
   */
  abstract addSigner(signer: Signer, chainId: SupportedChainId): Promise<number>

  /**
   * Remove a signer from the smart wallet
   * @param signer - Ethereum address (EOA) or a `WebAuthnAccount` to remove
   * @param chainId - Target chain on which the smart wallet operates
   * @param signerIndex - Index of the signer to remove, if not provided, it will be found by
   * doing a lookup on the smart wallet contract.
   * @returns Promise resolving to the receipt of the remove operation
   */
  abstract removeSigner(
    signer: Signer,
    chainId: SupportedChainId,
    signerIndex?: number,
  ): Promise<WaitForUserOperationReceiptReturnType>

  /**
   * Find the index of a signer in the smart wallet
   * @param signer - Ethereum address (EOA) or a `WebAuthnAccount` to find
   * @param chainId - Target chain on which the smart wallet operates
   * @returns Promise resolving to the onchain signer index for the found signer
   * returns -1 if the signer is not found
   */
  abstract findSignerIndexOnChain(
    signer: Signer,
    chainId: SupportedChainId,
  ): Promise<number>

  /**
   * Send tokens to another address
   * @description Prepares transaction data for sending tokens from this smart wallet
   * to a recipient address. Returns transaction data that can be executed via send().
   * @param amount - Amount to send in human-readable format
   * @param asset - Asset object with address mapping and metadata
   * @param chainId - Chain ID for the transaction
   * @param recipientAddress - Destination address for the tokens
   * @returns Promise resolving to prepared transaction data
   */
  abstract sendTokens(
    amount: number,
    asset: Asset,
    chainId: SupportedChainId,
    recipientAddress: Address,
  ): Promise<TransactionData>
}

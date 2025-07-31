import { type Address, type Hash } from 'viem'
import { unichain } from 'viem/chains'

import { fetchBalance } from '@/services/tokenBalance.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type {
  LendOptions,
  LendTransaction,
  TransactionData,
} from '@/types/lend.js'
import type { TokenBalance } from '@/types/token.js'
import type { VerbsInterface } from '@/types/verbs.js'
import type { Wallet as WalletInterface } from '@/types/wallet.js'
import { type AssetIdentifier, parseLendParams } from '@/utils/assets.js'

/**
 * Wallet implementation
 * @description Concrete implementation of the Wallet interface
 */
export class Wallet implements WalletInterface {
  id: string
  address!: Address
  private initialized: boolean = false
  private verbs: VerbsInterface
  private walletProvider: any // Store reference to wallet provider for signing

  /**
   * Create a new wallet instance
   * @param id - Unique wallet identifier
   * @param verbs - Verbs instance to access configured providers and chain manager
   */
  constructor(id: string, verbs: VerbsInterface, walletProvider?: any) {
    this.id = id
    this.verbs = verbs
    this.walletProvider = walletProvider
  }

  init(address: Address) {
    this.address = address
    this.initialized = true
  }

  /**
   * Get asset balances across all supported chains
   * @returns Promise resolving to array of asset balances
   */
  async getBalance(): Promise<TokenBalance[]> {
    if (!this.initialized) {
      throw new Error('Wallet not initialized')
    }

    const tokenBalancePromises = Object.values(SUPPORTED_TOKENS).map(
      async (token) => {
        // Access ChainManager through Verbs
        return fetchBalance(this.verbs.chainManager, this.address, token)
      },
    )

    return Promise.all(tokenBalancePromises)
  }

  /**
   * Lend assets to a lending market
   * @description Lends assets using the configured lending provider with human-readable amounts
   * @param amount - Human-readable amount to lend (e.g. 1.5)
   * @param asset - Asset symbol (e.g. 'usdc') or token address
   * @param marketId - Optional specific market ID or vault name
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   * @throws Error if no lending provider is configured
   */
  async lend(
    amount: number,
    asset: AssetIdentifier,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    if (!this.initialized) {
      throw new Error('Wallet not initialized')
    }

    // Parse human-readable inputs
    // TODO: Get actual chain ID from wallet context, for now using Unichain
    const { amount: parsedAmount, asset: resolvedAsset } = parseLendParams(
      amount,
      asset,
      unichain.id,
    )

    // Set receiver to wallet address if not specified
    const lendOptions: LendOptions = {
      ...options,
      receiver: options?.receiver || this.address,
    }

    console.log(
      `Lending ${amount} ${resolvedAsset.symbol} (${parsedAmount} wei) from wallet ${this.address}`,
    )

    // Delegate to the lend provider configured in Verbs
    // TODO: In a real implementation, this would:
    // 1. Check wallet balance for the asset
    // 2. Approve the lending protocol to spend the asset if needed
    // 3. Execute the lending transaction through the wallet's signing capabilities

    return this.verbs.lend.lend(
      resolvedAsset.address,
      parsedAmount,
      marketId,
      lendOptions,
    )
  }

  /**
   * Sign and send a transaction
   * @description Signs and sends a transaction using the configured wallet provider
   * @param transactionData - Transaction data to sign and send
   * @returns Promise resolving to transaction hash
   * @throws Error if wallet is not initialized or no wallet provider is configured
   */
  async sign(transactionData: TransactionData): Promise<Hash> {
    if (!this.initialized) {
      throw new Error('Wallet not initialized')
    }

    if (!this.walletProvider || !this.walletProvider.sign) {
      throw new Error('Wallet provider does not support transaction signing')
    }

    console.log(
      `Signing transaction to ${transactionData.to} with value ${transactionData.value} from wallet ${this.address}`,
    )

    return this.walletProvider.sign(this.id, transactionData)
  }
}

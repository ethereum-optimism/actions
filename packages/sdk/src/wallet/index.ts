import { type Address } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import { fetchBalance } from '@/services/tokenBalance.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type {
  LendOptions,
  LendProvider,
  LendTransaction,
} from '@/types/lend.js'
import type { TokenBalance } from '@/types/token.js'
import type { Wallet as WalletInterface } from '@/types/wallet.js'

/**
 * Wallet implementation
 * @description Concrete implementation of the Wallet interface
 */
export class Wallet implements WalletInterface {
  id: string
  private lendProvider?: LendProvider
  address!: Address
  private initialized: boolean = false
  private chainManager: ChainManager

  /**
   * Create a new wallet instance
   * @param id - Unique wallet identifier
   * @param lendProvider - Optional lending provider for wallet operations
   */
  constructor(
    id: string,
    chainManager: ChainManager,
    lendProvider?: LendProvider,
  ) {
    this.id = id
    this.chainManager = chainManager
    this.lendProvider = lendProvider
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
        return fetchBalance(this.chainManager, this.address, token)
      },
    )

    return Promise.all(tokenBalancePromises)
  }

  /**
   * Lend assets to a lending market
   * @description Lends assets using the configured lending provider
   * @param asset - Asset token address to lend
   * @param amount - Amount to lend (in wei)
   * @param marketId - Optional specific market ID
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   * @throws Error if no lending provider is configured
   */
  async lend(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    if (!this.lendProvider) {
      throw new Error('No lending provider configured for this wallet')
    }

    // TODO: In a real implementation, this would:
    // 1. Check wallet balance for the asset
    // 2. Approve the lending protocol to spend the asset if needed
    // 3. Execute the lending transaction through the wallet's signing capabilities

    return this.lendProvider.lend(asset, amount, marketId, options)
  }

  /**
   * Set lending provider
   * @description Updates the lending provider for this wallet
   * @param lendProvider - Lending provider instance
   */
  setLendProvider(lendProvider: LendProvider): void {
    this.lendProvider = lendProvider
  }
}

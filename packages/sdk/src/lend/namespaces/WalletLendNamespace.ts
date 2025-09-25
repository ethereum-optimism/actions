import type { Hash } from 'viem'

import type { LendProvider } from '@/lend/provider.js'
import type { Asset } from '@/types/asset.js'
import type {
  BaseLendConfig,
  ClosePositionParams,
  LendMarketId,
  LendMarketPosition,
  LendOpenPositionParams,
} from '@/types/lend.js'
import type { SmartWallet } from '@/wallet/base/SmartWallet.js'
import type { Wallet } from '@/wallet/base/Wallet.js'

/**
 * Wallet Lend Namespace
 * @description Full lending operations available on wallet.lend
 */
export class WalletLendNamespace<
  TConfig extends BaseLendConfig = BaseLendConfig,
> {
  constructor(
    protected readonly provider: LendProvider<TConfig>,
    private readonly wallet: Wallet,
  ) {}

  get config(): TConfig {
    return this.provider.config
  }

  // Inherited methods from VerbsLendNamespace
  getMarkets = (...args: Parameters<LendProvider<TConfig>['getMarkets']>) =>
    this.provider.getMarkets(...args)

  getMarket = (...args: Parameters<LendProvider<TConfig>['getMarket']>) =>
    this.provider.getMarket(...args)

  supportedChainIds = (
    ...args: Parameters<LendProvider<TConfig>['supportedChainIds']>
  ) => this.provider.supportedChainIds(...args)

  /**
   * Open a lending position
   * @description Signs and sends a lend transaction from the wallet for the given amount and asset
   */
  async openPosition({
    amount,
    asset,
    marketId,
    options,
  }: LendOpenPositionParams): Promise<Hash> {
    // Always use wallet address as receiver, ignore any receiver in options
    const lendOptions = {
      ...options,
      receiver: this.wallet.address,
    }

    // Get transaction details from provider
    const lendTransaction = await this.provider.openPosition({
      amount,
      asset,
      marketId,
      options: lendOptions,
    })

    // Execute the transaction using wallet
    const { transactionData } = lendTransaction
    if (!transactionData) {
      throw new Error('No transaction data returned from lend provider')
    }

    // Check if wallet is a SmartWallet (has send/sendBatch methods)
    if (!this.isSmartWallet(this.wallet)) {
      throw new Error(
        'Transaction execution is only supported for SmartWallet instances',
      )
    }

    // Execute approval + deposit or just deposit
    if (transactionData.approval) {
      return await this.wallet.sendBatch(
        [transactionData.approval, transactionData.deposit],
        marketId.chainId,
      )
    }

    return await this.wallet.send(transactionData.deposit, marketId.chainId)
  }

  /**
   * Get position information for this wallet
   * @param marketId - Market identifier (required)
   * @param asset - Asset filter (not yet supported)
   * @returns Promise resolving to position information
   */
  async getPosition(
    marketId?: LendMarketId,
    asset?: Asset,
  ): Promise<LendMarketPosition> {
    return this.provider.getPosition(this.wallet.address, marketId, asset)
  }

  /**
   * Close a lending position (withdraw from market)
   * @param closePositionParams - Position closing parameters
   * @returns Promise resolving to transaction hash
   */
  async closePosition({
    amount,
    asset,
    marketId,
    options,
  }: ClosePositionParams): Promise<Hash> {
    // Always use wallet address as receiver, ignore any receiver in options
    const closeOptions = {
      ...options,
      receiver: this.wallet.address,
    }

    // Get transaction details from provider
    const closeTransaction = await this.provider.closePosition({
      amount,
      asset,
      marketId,
      options: closeOptions,
    })

    // Execute the transaction using wallet
    const { transactionData } = closeTransaction
    if (!transactionData) {
      throw new Error(
        'No transaction data returned from close position provider',
      )
    }

    // Check if wallet is a SmartWallet (has send/sendBatch methods)
    if (!this.isSmartWallet(this.wallet)) {
      throw new Error(
        'Transaction execution is only supported for SmartWallet instances',
      )
    }

    // Execute approval + withdraw or just withdraw
    if (transactionData.approval) {
      return await this.wallet.sendBatch(
        [transactionData.approval, transactionData.deposit],
        marketId.chainId,
      )
    }

    return await this.wallet.send(transactionData.deposit, marketId.chainId)
  }

  /**
   * Type guard to check if wallet is a SmartWallet
   */
  private isSmartWallet(wallet: Wallet): wallet is SmartWallet {
    return (
      'send' in wallet &&
      typeof wallet.send === 'function' &&
      'sendBatch' in wallet &&
      typeof wallet.sendBatch === 'function'
    )
  }
}

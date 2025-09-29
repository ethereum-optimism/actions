import type { Hash } from 'viem'

import type { LendProvider } from '@/lend/provider.js'
import type {
  BaseLendConfig,
  ClosePositionParams,
  GetPositionParams,
  LendMarketPosition,
  LendOpenPositionParams,
} from '@/types/lend.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { SmartWallet } from '@/wallet/core/wallets/smart/abstract/SmartWallet.js'

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
  async openPosition(params: LendOpenPositionParams): Promise<Hash> {
    const lendOptions = {
      ...params.options,
      receiver: this.wallet.address,
    }

    const lendTransaction = await this.provider.openPosition({
      amount: params.amount,
      asset: params.asset,
      marketId: params.marketId,
      options: lendOptions,
    })

    const { transactionData } = lendTransaction
    if (!transactionData) {
      throw new Error('No transaction data returned from lend provider')
    }

    // TODO we will eventualy pull sendBatch and send into the Wallet class and remove this
    if (!this.isSmartWallet(this.wallet)) {
      throw new Error(
        'Transaction execution is only supported for SmartWallet instances',
      )
    }

    // Execute approval + deposit or just deposit
    if (transactionData.approval) {
      return await this.wallet.sendBatch(
        [transactionData.approval, transactionData.deposit],
        params.marketId.chainId,
      )
    }

    return await this.wallet.send(
      transactionData.deposit,
      params.marketId.chainId,
    )
  }

  /**
   * Get position information for this wallet
   * @param params - Position query parameters
   * @param params.marketId - Market identifier (required)
   * @param params.asset - Asset filter (not yet supported)
   * @returns Promise resolving to position information
   */
  async getPosition(params: GetPositionParams): Promise<LendMarketPosition> {
    return this.provider.getPosition(
      this.wallet.address,
      params.marketId,
      params.asset,
    )
  }

  /**
   * Close a lending position (withdraw from market)
   * @param closePositionParams - Position closing parameters
   * @returns Promise resolving to transaction hash
   */
  async closePosition(params: ClosePositionParams): Promise<Hash> {
    const closeOptions = {
      ...params.options,
      receiver: this.wallet.address,
    }

    const closeTransaction = await this.provider.closePosition({
      amount: params.amount,
      asset: params.asset,
      marketId: params.marketId,
      options: closeOptions,
    })

    const { transactionData } = closeTransaction
    if (!transactionData) {
      throw new Error(
        'No transaction data returned from close position provider',
      )
    }

    if (!this.isSmartWallet(this.wallet)) {
      throw new Error(
        'Transaction execution is only supported for SmartWallet instances',
      )
    }

    if (transactionData.approval) {
      return await this.wallet.sendBatch(
        [transactionData.approval, transactionData.deposit],
        params.marketId.chainId,
      )
    }

    return await this.wallet.send(
      transactionData.deposit,
      params.marketId.chainId,
    )
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

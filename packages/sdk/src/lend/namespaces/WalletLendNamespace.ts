import type { Address, Hash } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { LendProvider } from '@/lend/provider.js'
import type { Asset } from '@/types/asset.js'
import type {
  BaseLendConfig,
  LendMarketId,
  LendMarketPosition,
  LendOpenPositionParams,
  LendOptions,
  LendTransaction,
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
   * Withdraw assets from a market
   */
  async withdraw(
    asset: Address,
    amount: bigint,
    chainId: SupportedChainId,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // Always use wallet address as receiver, ignore any receiver in options
    const withdrawOptions: LendOptions = {
      ...options,
      receiver: this.wallet.address,
    }

    return this.provider.withdraw(
      asset,
      amount,
      chainId,
      marketId,
      withdrawOptions,
    )
  }
}

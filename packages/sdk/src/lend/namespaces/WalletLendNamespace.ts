import type { LendProvider } from '@/lend/provider.js'
import type {
  BaseLendConfig,
  ClosePositionParams,
  GetPositionParams,
  LendMarketPosition,
  LendOpenPositionParams,
  LendTransactionReceipt,
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
  async openPosition(
    params: LendOpenPositionParams,
  ): Promise<LendTransactionReceipt> {
    const lendTransaction = await this.provider.openPosition({
      ...params,
      walletAddress: this.wallet.address,
    })

    const { transactionData } = lendTransaction
    if (!transactionData) {
      throw new Error('No transaction data returned from lend provider')
    }

    if (!this.isSmartWallet(this.wallet)) {
      throw new Error(
        'Transaction execution is only supported for SmartWallet instances',
      )
    }

    if (transactionData.approval && transactionData.openPosition) {
      return await this.wallet.sendBatch(
        [transactionData.approval, transactionData.openPosition],
        params.marketId.chainId,
      )
    }

    if (!transactionData.openPosition) {
      throw new Error('No openPosition transaction data returned')
    }
    const userOperationReceipt = await this.wallet.send(
      transactionData.openPosition,
      params.marketId.chainId,
    )

    return {
      receipt: userOperationReceipt.receipt,
      userOpHash: userOperationReceipt.userOpHash,
    }
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
  async closePosition(
    params: ClosePositionParams,
  ): Promise<LendTransactionReceipt> {
    const closeTransaction = await this.provider.closePosition({
      ...params,
      walletAddress: this.wallet.address,
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

    if (!transactionData.closePosition) {
      throw new Error('No closePosition transaction data returned')
    }

    const userOperationReceipt = await this.wallet.send(
      transactionData.closePosition,
      params.marketId.chainId,
    )

    return {
      receipt: userOperationReceipt.receipt,
      userOpHash: userOperationReceipt.userOpHash,
    }
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

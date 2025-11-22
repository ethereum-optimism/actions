import type { LendProvider } from '@/lend/core/LendProvider.js'
import type {
  BaseLendConfig,
  ClosePositionParams,
  GetPositionParams,
  LendMarketPosition,
  LendOpenPositionParams,
  LendTransactionReceipt,
} from '@/types/lend/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

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

  // Inherited methods from ActionsLendNamespace
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
   * @param params - Lending position parameters
   * @param params.marketId - Market identifier to open position in
   * @param params.amount - Amount to lend
   * @returns Promise resolving to transaction receipt
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

    if (transactionData.approval && transactionData.openPosition) {
      return await this.wallet.sendBatch(
        [transactionData.approval, transactionData.openPosition],
        params.marketId.chainId,
      )
    }

    if (!transactionData.openPosition) {
      throw new Error('No openPosition transaction data returned')
    }
    return await this.wallet.send(
      transactionData.openPosition,
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
   * @param params - Position closing parameters
   * @param params.marketId - Market identifier to close position in
   * @param params.amount - Amount to withdraw
   * @returns Promise resolving to transaction receipt
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

    if (!transactionData.closePosition) {
      throw new Error('No closePosition transaction data returned')
    }

    return await this.wallet.send(
      transactionData.closePosition,
      params.marketId.chainId,
    )
  }
}

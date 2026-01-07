import type {
  ClosePositionParams,
  GetPositionParams,
  LendMarketPosition,
  LendOpenPositionParams,
  LendTransactionReceipt,
} from '@/types/lend/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

import { BaseLendNamespace, type LendProviders } from './BaseLendNamespace.js'

/**
 * Wallet Lend Namespace
 * @description Full lending operations available on wallet.lend
 */
export class WalletLendNamespace extends BaseLendNamespace {
  constructor(
    providers: LendProviders,
    private readonly wallet: Wallet,
  ) {
    super(providers)
  }

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
    const provider = this.getProviderForMarket(params.marketId)

    const lendTransaction = await provider.openPosition({
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
    if (!params.marketId) {
      throw new Error('marketId is required')
    }

    const provider = this.getProviderForMarket(params.marketId)

    return provider.getPosition(
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
    const provider = this.getProviderForMarket(params.marketId)

    const closeTransaction = await provider.closePosition({
      ...params,
      walletAddress: this.wallet.address,
    })

    const { transactionData } = closeTransaction
    if (!transactionData) {
      throw new Error(
        'No transaction data returned from close position provider',
      )
    }

    // If both approval and closePosition are present, batch them
    if (transactionData.approval && transactionData.closePosition) {
      return await this.wallet.sendBatch(
        [transactionData.approval, transactionData.closePosition],
        params.marketId.chainId,
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

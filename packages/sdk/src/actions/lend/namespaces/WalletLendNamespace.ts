import { BaseLendNamespace } from '@/actions/lend/namespaces/BaseLendNamespace.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  ClosePositionParams,
  GetPositionParams,
  LendMarketPosition,
  LendOpenPositionParams,
  LendTransaction,
  LendTransactionReceipt,
} from '@/types/lend/index.js'
import type { LendProviders } from '@/types/providers.js'
import { executeTransactionBatch } from '@/wallet/core/utils/executeTransactionBatch.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

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

    return this.dispatch(lendTransaction, params.marketId.chainId)
  }

  /**
   * Get position information for this wallet
   * @param params - Position query parameters
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

    return this.dispatch(closeTransaction, params.marketId.chainId)
  }

  /**
   * Send a lend transaction, batching an ERC-20 approval ahead of the
   * position call when one was provided by the provider. Defers to
   * `executeTransactionBatch` for the actual 1-vs-N send/sendBatch dispatch.
   */
  private dispatch(
    transaction: LendTransaction,
    chainId: SupportedChainId,
  ): Promise<LendTransactionReceipt> {
    const { transactionData } = transaction
    const txs = transactionData.approval
      ? [transactionData.approval, transactionData.position]
      : [transactionData.position]
    return executeTransactionBatch(this.wallet, txs, chainId)
  }
}

import type { LendProvider } from '@/lend/core/LendProvider.js'
import type { AaveLendProvider } from '@/lend/providers/aave/AaveLendProvider.js'
import type { MorphoLendProvider } from '@/lend/providers/morpho/MorphoLendProvider.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type {
  ClosePositionParams,
  GetLendMarketParams,
  GetLendMarketsParams,
  GetPositionParams,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendOpenPositionParams,
  LendTransactionReceipt,
} from '@/types/lend/index.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Wallet Lend Namespace
 * @description Full lending operations available on wallet.lend
 */
export class WalletLendNamespace {
  constructor(
    protected readonly providers: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    },
    private readonly wallet: Wallet,
  ) {}

  /**
   * Route a market to the correct provider
   * @param marketId - Market identifier to route
   * @returns The provider that handles this market
   * @throws Error if no provider is found for the market
   */
  private getProviderForMarket(
    marketId: LendMarketId,
  ): MorphoLendProvider | AaveLendProvider {
    const allProviders = [this.providers.morpho, this.providers.aave].filter(
      Boolean,
    ) as Array<MorphoLendProvider | AaveLendProvider>

    for (const provider of allProviders) {
      const market = provider.config.marketAllowlist?.find(
        (m: LendMarketId) =>
          m.address.toLowerCase() === marketId.address.toLowerCase() &&
          m.chainId === marketId.chainId,
      )

      if (market) {
        return provider
      }
    }

    throw new Error(
      `No provider configured for market ${marketId.address} on chain ${marketId.chainId}`,
    )
  }

  /**
   * Get all markets across all configured providers
   * @param params - Optional filtering parameters
   * @returns Promise resolving to array of markets from all providers
   */
  async getMarkets(params: GetLendMarketsParams = {}): Promise<LendMarket[]> {
    const allProviders = [this.providers.morpho, this.providers.aave].filter(
      Boolean,
    ) as Array<MorphoLendProvider | AaveLendProvider>

    const results = await Promise.all(
      allProviders.map((p) => p.getMarkets(params)),
    )

    return results.flat()
  }

  /**
   * Get a specific market by routing to the correct provider
   * @param params - Market identifier
   * @returns Promise resolving to market information
   */
  async getMarket(params: GetLendMarketParams): Promise<LendMarket> {
    const provider = this.getProviderForMarket(params)
    return provider.getMarket(params)
  }

  /**
   * Get supported chain IDs across all providers
   * @returns Array of unique chain IDs supported by any provider
   */
  supportedChainIds(): number[] {
    const allProviders = [this.providers.morpho, this.providers.aave].filter(
      Boolean,
    ) as Array<MorphoLendProvider | AaveLendProvider>

    const allChains = allProviders.flatMap((p) => p.supportedChainIds())
    return [...new Set(allChains)]
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

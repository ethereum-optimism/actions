import type { LendProvider } from '@/lend/core/LendProvider.js'
import type { AaveLendProvider } from '@/lend/providers/aave/AaveLendProvider.js'
import type { MorphoLendProvider } from '@/lend/providers/morpho/MorphoLendProvider.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type {
  GetLendMarketParams,
  GetLendMarketsParams,
  LendMarket,
  LendMarketId,
} from '@/types/lend/index.js'

/**
 * Actions Lend Namespace
 * @description Read-only lending operations available on actions.lend
 */
export class ActionsLendNamespace {
  constructor(
    protected readonly providers: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    },
  ) {}

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
      if (market) return provider
    }

    throw new Error(
      `No provider configured for market ${marketId.address} on chain ${marketId.chainId}`,
    )
  }
}

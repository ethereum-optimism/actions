import type { LendProvider } from '@/actions/lend/core/LendProvider.js'
import { BaseNamespace } from '@/actions/shared/BaseNamespace.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type {
  GetLendMarketParams,
  GetLendMarketsParams,
  LendMarket,
  LendMarketId,
} from '@/types/lend/index.js'
import type { LendProviders } from '@/types/providers.js'
import { findMarketInAllowlist } from '@/utils/markets.js'

export type { LendProviders } from '@/types/providers.js'

type ConfiguredLendProvider = LendProvider<LendProviderConfig>

/**
 * Base Lend Namespace
 * @description Shared lending operations for Actions and Wallet namespaces.
 */
export abstract class BaseLendNamespace extends BaseNamespace<
  ConfiguredLendProvider,
  LendProviders
> {
  /**
   * Get all markets across all configured providers
   * @param params - Optional filtering parameters
   * @returns Promise resolving to array of markets from all providers
   */
  async getMarkets(params: GetLendMarketsParams = {}): Promise<LendMarket[]> {
    const results = await Promise.all(
      this.getAllProviders().map((p) => p.getMarkets(params)),
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
   * Route a market to the correct provider
   * @param marketId - Market identifier to route
   * @returns The provider that handles this market
   * @throws Error if no provider is found for the market
   */
  protected getProviderForMarket(
    marketId: LendMarketId,
  ): ConfiguredLendProvider {
    for (const provider of this.getAllProviders()) {
      if (findMarketInAllowlist(provider.config.marketAllowlist, marketId)) {
        return provider
      }
    }

    throw new Error(
      `No provider configured for market ${marketId.address} on chain ${marketId.chainId}`,
    )
  }
}

import type { Address } from 'viem'

import type { LendProvider } from '@/actions/lend/core/LendProvider.js'
import { findMarketInAllowlist } from '@/actions/lend/utils/markets.js'
import { BaseNamespace } from '@/actions/shared/BaseNamespace.js'
import { ProviderNotConfiguredError } from '@/core/error/errors.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type {
  GetLendMarketParams,
  GetLendMarketsParams,
  GetPositionsParams,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
} from '@/types/lend/index.js'
import type { LendProviders } from '@/types/providers.js'

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
   * @description Aggregates wallet positions across selected providers.
   * @param walletAddress - User wallet address to check positions for
   * @param params - Optional chain/provider filters and result options
   * @returns Promise resolving to the wallet's positions across providers
   * @throws InvalidParamsError or ChainNotSupportedError for invalid filters
   */
  protected async fetchPositions(
    walletAddress: Address,
    params: GetPositionsParams = {},
  ): Promise<LendMarketPosition[]> {
    const providers = params.provider
      ? [this.providers[params.provider]].filter(
          (provider): provider is ConfiguredLendProvider =>
            provider !== undefined,
        )
      : this.getAllProviders()

    const results = await Promise.all(
      providers.map((provider) => provider.getPositions(walletAddress, params)),
    )
    const positions = results.flat()

    return params.options?.nonZeroOnly
      ? positions.filter((position) => position.balance > 0n)
      : positions
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

    throw new ProviderNotConfiguredError({
      provider: marketId.address,
      details: `No provider configured for market on chain ${marketId.chainId}`,
    })
  }
}

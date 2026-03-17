import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { SwapProvider } from '@/swap/core/SwapProvider.js'
import type { SwapProviderName, SwapRoutingConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  SwapMarket,
  SwapPrice,
  SwapPriceParams,
  SwapProviderConfig,
  SwapProviders,
} from '@/types/swap/index.js'

/**
 * Base swap namespace with shared read-only operations
 */
export abstract class BaseSwapNamespace {
  constructor(
    protected readonly providers: SwapProviders,
    protected readonly routing?: SwapRoutingConfig,
  ) {}

  /**
   * Get price quote for a swap
   */
  async price(params: SwapPriceParams): Promise<SwapPrice> {
    const provider = this.resolveProvider(
      params.provider,
      params.assetIn,
      params.assetOut!,
      params.chainId,
    )
    return provider.getPrice(params)
  }

  /**
   * Get a specific swap market by iterating all providers
   * @param params - Market identifier
   * @returns Market information
   */
  async getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    for (const provider of this.getAllProviders()) {
      try {
        return await provider.getMarket(params)
      } catch {
        continue
      }
    }
    throw new Error(
      `Market with poolId ${params.poolId} not found on chain ${params.chainId}`,
    )
  }

  /**
   * Get available swap markets across all providers
   * @param params - Optional filtering by chainId or asset
   * @returns Promise resolving to array of markets from all providers
   */
  async getMarkets(params: GetSwapMarketsParams = {}): Promise<SwapMarket[]> {
    const results = await Promise.all(
      this.getAllProviders().map((p) => p.getMarkets(params)),
    )
    return results.flat()
  }

  /**
   * Get all supported chain IDs across all providers
   */
  supportedChainIds(): SupportedChainId[] {
    const chainIds = new Set<SupportedChainId>()
    for (const provider of this.getAllProviders()) {
      for (const chainId of provider.supportedChainIds()) {
        chainIds.add(chainId)
      }
    }
    return Array.from(chainIds)
  }

  // SwapProviders keys are optional (uniswap?, velodrome?, etc.) so filter out unconfigured ones
  protected getAllProviders(): Array<SwapProvider<SwapProviderConfig>> {
    return Object.values(this.providers).filter(
      (p): p is SwapProvider<SwapProviderConfig> => p !== undefined,
    )
  }

  /**
   * Resolve which provider handles a request.
   *
   * Precedence:
   * 1. Explicit `provider` param on the call
   * 2. routing.defaultProvider (when no strategy set)
   * 3. routing.strategy match (market-aware, defaultProvider as tiebreaker)
   * 4. First provider whose allowlist matches
   * 5. First configured provider
   */
  protected resolveProvider(
    provider: SwapProviderName | undefined,
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): SwapProvider<SwapProviderConfig> {
    const allProviders = this.getAllProviders()
    if (allProviders.length === 0) {
      throw new Error('No swap provider configured')
    }

    // 1. Explicit provider param
    if (provider) {
      const named = this.providers[provider]
      if (!named) {
        throw new Error(`Swap provider "${provider}" not configured`)
      }
      return named
    }

    // Single provider — no routing needed
    if (allProviders.length === 1) {
      return allProviders[0]
    }

    // 2. defaultProvider with no strategy — always use it
    if (this.routing?.defaultProvider && !this.routing.strategy) {
      const defaultP = this.providers[this.routing.defaultProvider]
      if (defaultP) return defaultP
    }

    // 3. Strategy-based routing (currently only 'price' — falls through to
    //    market-based matching for now; best-price comparison is a future enhancement)

    // 4. Match by market allowlist
    for (const p of allProviders) {
      if (p.isMarketSupported(assetIn, assetOut, chainId)) {
        return p
      }
    }

    // 5. Match by chain support
    for (const p of allProviders) {
      if (p.isChainSupported(chainId)) {
        return p
      }
    }

    return allProviders[0]
  }
}

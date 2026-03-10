import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { SwapProvider } from '@/swap/core/SwapProvider.js'
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
  constructor(protected readonly providers: SwapProviders) {}

  /**
   * Get price quote for a swap
   */
  async price(params: SwapPriceParams): Promise<SwapPrice> {
    const provider = this.getProvider()
    return provider.getPrice(params)
  }

  /**
   * Get a specific swap market
   * @param params - Market identifier
   * @returns Market information
   */
  async getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    const provider = this.getProvider()
    return provider.getMarket(params)
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

  // SwapProviders keys are optional (uniswap?, aerodrome?, etc.) so filter out unconfigured ones
  protected getAllProviders(): Array<SwapProvider<SwapProviderConfig>> {
    return Object.values(this.providers).filter(
      (p): p is SwapProvider<SwapProviderConfig> => p !== undefined,
    )
  }

  // Future: resolve the best provider for given params (e.g. best price across Uniswap, Aerodrome, etc.)
  protected getProvider(): SwapProvider<SwapProviderConfig> {
    const provider = this.providers.uniswap
    if (!provider) {
      throw new Error('No swap provider configured')
    }
    return provider
  }
}

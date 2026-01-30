import type { SwapProvider } from '@/swap/core/SwapProvider.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { SwapProviderConfig } from '@/types/swap/index.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  SwapMarket,
  SwapPrice,
  SwapPriceParams,
} from '@/types/swap/index.js'

export type SwapProviders = {
  uniswap?: SwapProvider<SwapProviderConfig>
}

/**
 * Base swap namespace with shared read-only operations
 */
export abstract class BaseSwapNamespace {
  constructor(protected readonly providers: SwapProviders) {}

  /**
   * Get price quote for a swap
   */
  async price(params: SwapPriceParams): Promise<SwapPrice> {
    const provider = this.getProviderForChain(params.chainId)
    return provider.getPrice(params)
  }

  /**
   * Get a specific swap market
   * @param params - Market identifier
   * @returns Market information
   */
  async getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    const provider = this.getProviderForChain(params.chainId)
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

  protected getAllProviders(): SwapProvider<SwapProviderConfig>[] {
    return Object.values(this.providers).filter(
      (p): p is SwapProvider<SwapProviderConfig> => p !== undefined,
    )
  }

  protected getProviderForChain(
    chainId: SupportedChainId,
  ): SwapProvider<SwapProviderConfig> {
    for (const provider of this.getAllProviders()) {
      if (provider.isChainSupported(chainId)) {
        return provider
      }
    }
    throw new Error(`No swap provider available for chain ${chainId}`)
  }
}

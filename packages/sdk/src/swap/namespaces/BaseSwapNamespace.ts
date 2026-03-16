import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { SwapProvider } from '@/swap/core/SwapProvider.js'
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
  constructor(protected readonly providers: SwapProviders) {}

  /**
   * Get price quote for a swap
   */
  async price(params: SwapPriceParams): Promise<SwapPrice> {
    const provider = this.getProviderForParams(
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
   * Get the provider that supports the given market (asset pair + chain).
   * Checks each provider's allowlist/blocklist to find the correct match.
   * Falls back to chain support, then first configured provider.
   */
  protected getProviderForParams(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): SwapProvider<SwapProviderConfig> {
    const allProviders = this.getAllProviders()
    if (allProviders.length === 0) {
      throw new Error('No swap provider configured')
    }
    if (allProviders.length === 1) {
      return allProviders[0]
    }
    // First pass: match by market allowlist (most specific)
    for (const provider of allProviders) {
      if (provider.isMarketSupported(assetIn, assetOut, chainId)) {
        return provider
      }
    }
    // Second pass: match by chain support
    for (const provider of allProviders) {
      if (provider.isChainSupported(chainId)) {
        return provider
      }
    }
    return allProviders[0]
  }
}

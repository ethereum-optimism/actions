import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { SwapProvider } from '@/swap/core/SwapProvider.js'
import type { SwapProviderName, SwapSettings } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  SwapMarket,
  SwapProviderConfig,
  SwapProviders,
  SwapQuote,
  SwapQuoteParams,
  SwapQuoteParamsResolved,
} from '@/types/swap/index.js'
import { passthroughResolver, type RecipientResolver } from '@/utils/ens.js'

/**
 * Base swap namespace with shared read-only operations
 */
export abstract class BaseSwapNamespace {
  protected readonly resolveRecipient: RecipientResolver

  constructor(
    protected readonly providers: SwapProviders,
    resolveRecipient?: RecipientResolver,
    protected readonly settings?: SwapSettings,
  ) {
    this.resolveRecipient = resolveRecipient ?? passthroughResolver
  }

  /**
   * Get a swap quote with pre-built execution data.
   * When `routing: 'price'` is set in settings and no explicit provider is requested,
   * fetches quotes from all eligible providers in parallel and returns the best price.
   * @param params - Quote parameters (assets, amounts, chain, optional provider)
   * @returns The best available SwapQuote
   */
  async getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    const recipient = await this.resolveRecipient(params.recipient)
    const resolved: SwapQuoteParamsResolved = { ...params, recipient }

    // Explicit provider — skip routing
    if (resolved.provider) {
      return this.resolveProvider(
        resolved.provider,
        resolved.assetIn,
        resolved.assetOut,
        resolved.chainId,
      ).getQuote(resolved)
    }

    // Price routing — quote all eligible providers, return best
    if (this.settings?.routing === 'price') {
      return this.getBestQuote(resolved)
    }

    // No routing — resolve single provider via fallback logic
    return this.resolveProvider(
      undefined,
      resolved.assetIn,
      resolved.assetOut,
      resolved.chainId,
    ).getQuote(resolved)
  }

  /**
   * Fetch quotes from all eligible providers in parallel and return the best.
   * @param params - Quote parameters
   * @returns The quote with the highest amountOut
   * @throws If no provider returns a valid quote
   */
  private async getBestQuote(
    params: SwapQuoteParamsResolved,
  ): Promise<SwapQuote> {
    const quotes = await this.fetchAllQuotes(params)

    let best: SwapQuote | null = null
    for (const quote of quotes) {
      if (!best || quote.amountOutRaw > best.amountOutRaw) {
        best = quote
      }
    }

    if (!best) {
      throw new Error(
        `All providers failed to quote ${params.assetIn.metadata.symbol}/${params.assetOut.metadata.symbol}`,
      )
    }

    return best
  }

  /**
   * Fetch quotes from all eligible providers in parallel.
   * Providers that don't support the pair or fail to quote are silently skipped.
   * @param params - Quote parameters
   * @returns Array of successful quotes (may be empty if all providers fail)
   */
  private async fetchAllQuotes(
    params: SwapQuoteParamsResolved,
  ): Promise<SwapQuote[]> {
    const eligible = this.getAllProviders().filter((p) =>
      p.isMarketSupported(params.assetIn, params.assetOut, params.chainId),
    )

    if (eligible.length === 0) {
      throw new Error(
        `No provider supports ${params.assetIn.metadata.symbol}/${params.assetOut.metadata.symbol} on chain ${params.chainId}`,
      )
    }

    const results = await Promise.allSettled(
      eligible.map((p) => p.getQuote(params)),
    )

    return results
      .filter(
        (r): r is PromiseFulfilledResult<SwapQuote> => r.status === 'fulfilled',
      )
      .map((r) => r.value)
  }

  /**
   * Fetch quotes from all eligible providers in parallel.
   * Unlike getQuote(), returns all successful quotes instead of just the best.
   * If an explicit provider is specified, returns a single-element array from that provider.
   * @param params - Quote parameters (assets, amounts, chain, optional provider)
   * @returns Array of SwapQuotes sorted by amountOut descending (best first)
   */
  async getQuotes(params: SwapQuoteParams): Promise<SwapQuote[]> {
    const recipient = await this.resolveRecipient(params.recipient)
    const resolved: SwapQuoteParamsResolved = { ...params, recipient }

    if (resolved.provider) {
      return [
        await this.resolveProvider(
          resolved.provider,
          resolved.assetIn,
          resolved.assetOut,
          resolved.chainId,
        ).getQuote(resolved),
      ]
    }

    const quotes = await this.fetchAllQuotes(resolved)
    return quotes.sort((a, b) =>
      a.amountOutRaw > b.amountOutRaw
        ? -1
        : a.amountOutRaw < b.amountOutRaw
          ? 1
          : 0,
    )
  }

  /**
   * Get a specific swap market by ID.
   * @param params - Market identifier (poolId + chainId)
   * @param provider - Optional provider name to query directly instead of searching all
   * @returns Market information
   */
  async getMarket(
    params: GetSwapMarketParams,
    provider?: SwapProviderName,
  ): Promise<SwapMarket> {
    if (provider) {
      const named = this.providers[provider]
      if (!named) {
        throw new Error(`Swap provider "${provider}" not configured`)
      }
      return named.getMarket(params)
    }

    for (const p of this.getAllProviders()) {
      try {
        return await p.getMarket(params)
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

    // 2. defaultProvider with no routing strategy — always use it
    if (this.settings?.defaultProvider && !this.settings.routing) {
      const provider = this.providers[this.settings.defaultProvider]
      if (provider) return provider
    }

    // 3. Match by market allowlist
    for (const p of allProviders) {
      if (p.isMarketSupported(assetIn, assetOut, chainId)) {
        return p
      }
    }

    // 4. Match by chain support
    for (const p of allProviders) {
      if (p.isChainSupported(chainId)) {
        return p
      }
    }

    return allProviders[0]
  }
}

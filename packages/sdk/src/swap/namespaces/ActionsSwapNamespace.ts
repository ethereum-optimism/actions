import { BaseSwapNamespace } from '@/swap/namespaces/BaseSwapNamespace.js'
import type { SwapQuote, SwapQuoteParams } from '@/types/swap/index.js'

/**
 * Actions swap namespace (read-only, no wallet required).
 * Provides getQuote(), getMarket(), and getMarkets() for read-only access without a wallet.
 * Optimized to skip calldata encoding (faster than WalletSwapNamespace).
 */
export class ActionsSwapNamespace extends BaseSwapNamespace {
  /**
   * Get a swap quote optimized for read-only access (no execution calldata).
   * When `routing: 'price'` is set in settings and no explicit provider is requested,
   * fetches quotes from all eligible providers in parallel and returns the best price.
   * @param params - Quote parameters (assets, amounts, chain, optional provider)
   * @returns SwapQuote with pricing/amounts, but no execution field (cannot be executed)
   */
  async getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    // Explicit provider — skip routing
    if (params.provider) {
      const provider = this.resolveProvider(
        params.provider,
        params.assetIn,
        params.assetOut,
        params.chainId,
      )
      return provider.getQuoteReadOnly(params)
    }

    // Price routing — quote all eligible providers, return best
    if (this.settings?.routing === 'price') {
      return this.getBestQuoteReadOnly(params)
    }

    // No routing — resolve single provider via fallback logic
    const provider = this.resolveProvider(
      undefined,
      params.assetIn,
      params.assetOut,
      params.chainId,
    )
    return provider.getQuoteReadOnly(params)
  }

  /**
   * Fetch read-only quotes from all eligible providers in parallel and return the best.
   * @param params - Quote parameters
   * @returns The quote with the highest amountOut
   * @throws If no provider returns a valid quote
   */
  private async getBestQuoteReadOnly(
    params: SwapQuoteParams,
  ): Promise<SwapQuote> {
    const quotes = await this.fetchAllQuotesReadOnly(params)

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
   * Fetch read-only quotes from all eligible providers in parallel.
   * Providers that don't support the pair or fail to quote are silently skipped.
   * @param params - Quote parameters
   * @returns Array of successful quotes (may be empty if all providers fail)
   */
  private async fetchAllQuotesReadOnly(
    params: SwapQuoteParams,
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
      eligible.map((p) => p.getQuoteReadOnly(params)),
    )

    return results
      .filter(
        (r): r is PromiseFulfilledResult<SwapQuote> => r.status === 'fulfilled',
      )
      .map((r) => r.value)
  }

  /**
   * Fetch read-only quotes from all eligible providers in parallel.
   * Unlike getQuote(), returns all successful quotes instead of just the best.
   * If an explicit provider is specified, returns a single-element array from that provider.
   * @param params - Quote parameters (assets, amounts, chain, optional provider)
   * @returns Array of SwapQuotes sorted by amountOut descending (best first), without execution data
   */
  async getQuotes(params: SwapQuoteParams): Promise<SwapQuote[]> {
    if (params.provider) {
      const provider = this.resolveProvider(
        params.provider,
        params.assetIn,
        params.assetOut,
        params.chainId,
      )
      return [await provider.getQuoteReadOnly(params)]
    }

    const quotes = await this.fetchAllQuotesReadOnly(params)
    return quotes.sort((a, b) =>
      a.amountOutRaw > b.amountOutRaw
        ? -1
        : a.amountOutRaw < b.amountOutRaw
          ? 1
          : 0,
    )
  }
}

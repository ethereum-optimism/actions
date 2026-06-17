import { BaseSwapNamespace } from '@/actions/swap/namespaces/BaseSwapNamespace.js'
import type {
  PriceQuote,
  SwapQuote,
  SwapQuoteParams,
} from '@/types/swap/index.js'

/**
 * Strip the execution-only fields off a full quote, leaving a price-only
 * {@link PriceQuote}. Drops `execution` and `recipient` (which, without a
 * wallet bound, would otherwise carry the Universal Router `msg.sender`
 * sentinel) plus the `approvalMode` execution hint.
 */
function toPriceQuote(quote: SwapQuote): PriceQuote {
  const {
    execution: _execution,
    recipient: _recipient,
    approvalMode: _approvalMode,
    ...priceQuote
  } = quote
  return priceQuote
}

/**
 * Actions swap namespace (read-only, no wallet required).
 * Provides getQuote(), getMarket(), and getMarkets() for read-only access
 * without a wallet.
 *
 * Quotes are returned as {@link PriceQuote} — pricing, amounts, and route only,
 * with no recipient or execution data. They are intentionally un-executable:
 * re-quote via `wallet.swap.getQuote(...)` to obtain an executable
 * {@link SwapQuote} bound to a wallet.
 */
export class ActionsSwapNamespace extends BaseSwapNamespace {
  /**
   * Get a price-only swap quote (no recipient, no execution data).
   * @param params - Quote parameters (assets, amounts, chain, optional provider)
   * @returns The best available PriceQuote
   */
  async getQuote(params: SwapQuoteParams): Promise<PriceQuote> {
    return toPriceQuote(await this.resolveQuote(params))
  }

  /**
   * Get price-only quotes from all eligible providers, best price first.
   * @param params - Quote parameters (assets, amounts, chain, optional provider)
   * @returns Array of PriceQuotes sorted by amountOut descending (best first)
   */
  async getQuotes(params: SwapQuoteParams): Promise<PriceQuote[]> {
    return (await this.resolveQuotes(params)).map(toPriceQuote)
  }
}

import { BaseSwapNamespace } from '@/actions/swap/namespaces/BaseSwapNamespace.js'

/**
 * Actions swap namespace (read-only, no wallet required).
 * Provides getQuote(), getMarket(), and getMarkets() for read-only access without a wallet.
 */
export class ActionsSwapNamespace extends BaseSwapNamespace {}

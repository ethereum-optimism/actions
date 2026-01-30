import { BaseSwapNamespace } from './BaseSwapNamespace.js'

/**
 * Actions swap namespace (read-only, no wallet required)
 * @description Provides price(), getMarket(), and getMarkets() for read-only access without a wallet
 */
export class ActionsSwapNamespace extends BaseSwapNamespace {}

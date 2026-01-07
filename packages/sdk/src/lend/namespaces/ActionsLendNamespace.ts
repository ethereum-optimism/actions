import type {
  GetLendMarketParams,
  GetLendMarketsParams,
  LendMarket,
} from '@/types/lend/index.js'

import { BaseLendNamespace, type LendProviders } from './BaseLendNamespace.js'

/**
 * Actions Lend Namespace
 * @description Read-only lending operations available on actions.lend
 */
export class ActionsLendNamespace extends BaseLendNamespace {
  constructor(providers: LendProviders) {
    super(providers)
  }

  /**
   * Get all markets across all configured providers
   * @param params - Optional filtering parameters
   * @returns Promise resolving to array of markets from all providers
   */
  async getMarkets(params: GetLendMarketsParams = {}): Promise<LendMarket[]> {
    return super.getMarkets(params)
  }

  /**
   * Get a specific market by routing to the correct provider
   * @param params - Market identifier
   * @returns Promise resolving to market information
   */
  async getMarket(params: GetLendMarketParams): Promise<LendMarket> {
    return super.getMarket(params)
  }

  /**
   * Get supported chain IDs across all providers
   * @returns Array of unique chain IDs supported by any provider
   */
  supportedChainIds(): number[] {
    return super.supportedChainIds()
  }
}

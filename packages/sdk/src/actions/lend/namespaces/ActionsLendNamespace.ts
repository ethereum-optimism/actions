import type { Address } from 'viem'

import type {
  GetPositionsParams,
  LendMarketPosition,
} from '@/types/lend/index.js'

import { BaseLendNamespace } from './BaseLendNamespace.js'

/**
 * Actions Lend Namespace
 * @description Read-only lending operations available on actions.lend
 */
export class ActionsLendNamespace extends BaseLendNamespace {
  /**
   * Get all of a wallet's positions across configured providers and markets
   * @description One call replaces the per-market `getPosition` fan-out: walks
   * every configured provider's market allowlist, isolates per-market RPC
   * failures, and returns the same `LendMarketPosition` shape `getPosition`
   * returns.
   * @param walletAddress - Wallet address to fetch positions for
   * @param params - Optional chain/provider filters and zero-balance toggle
   * @returns Promise resolving to the wallet's positions
   */
  async getPositions(
    walletAddress: Address,
    params: GetPositionsParams = {},
  ): Promise<LendMarketPosition[]> {
    return this.fetchPositions(walletAddress, params)
  }
}

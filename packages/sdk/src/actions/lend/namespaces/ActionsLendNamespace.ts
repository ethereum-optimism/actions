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
   * @description Gets wallet positions across configured providers and markets.
   * @param walletAddress - Wallet address to fetch positions for
   * @param params - Optional chain/provider filters and result options
   * @returns Promise resolving to the wallet's positions
   * @throws InvalidParamsError or ChainNotSupportedError for invalid filters
   */
  async getPositions(
    walletAddress: Address,
    params: GetPositionsParams = {},
  ): Promise<LendMarketPosition[]> {
    return this.fetchPositions(walletAddress, params)
  }
}

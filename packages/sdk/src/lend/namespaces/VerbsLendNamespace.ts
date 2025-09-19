import type { Address } from 'viem'

import type { LendProvider } from '@/lend/provider.js'
import type {
  BaseLendConfig,
  LendConfig,
  LendMarket,
  LendMarketId,
} from '@/types/lend.js'

/**
 * Verbs Lend Namespace
 * @description Read-only lending operations available on verbs.lend
 */
export class VerbsLendNamespace<TConfig extends BaseLendConfig = LendConfig> {
  constructor(protected readonly provider: LendProvider<TConfig>) {}

  /**
   * Get lending provider configuration
   * @description Access to provider configuration including defaultSlippage, provider type, etc.
   */
  get config(): TConfig {
    return this.provider.config
  }

  /**
   * Get list of available lending markets
   */
  getMarkets(): Promise<LendMarket[]> {
    return this.provider.getMarkets()
  }

  /**
   * Get detailed information for a specific market
   */
  getMarket(marketId: LendMarketId): Promise<LendMarket> {
    return this.provider.getMarket(marketId)
  }

  /**
   * Get market balance for a specific wallet
   */
  getMarketBalance(
    marketId: LendMarketId,
    walletAddress: Address,
  ): Promise<{
    balance: bigint
    balanceFormatted: string
    shares: bigint
    sharesFormatted: string
    chainId: number
  }> {
    return this.provider.getMarketBalance(marketId, walletAddress)
  }

  /**
   * Get list of supported chain IDs
   */
  supportedChainIds(): number[] {
    return this.provider.supportedChainIds()
  }
}

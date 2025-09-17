import type { Address } from 'viem'

import type { LendProvider } from '@/lend/provider.js'
import type { LendMarket, LendMarketId, LendConfig } from '@/types/lend.js'

/**
 * Verbs Lend Namespace
 * @description Read-only lending operations available on verbs.lend
 */
export class VerbsLendNamespace {
  constructor(protected readonly provider: LendProvider) {}

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
    marketAddress: Address,
    walletAddress: Address,
  ): Promise<{
    balance: bigint
    balanceFormatted: string
    shares: bigint
    sharesFormatted: string
    chainId: number
  }> {
    return this.provider.getMarketBalance(marketAddress, walletAddress)
  }

  /**
   * Get list of supported network IDs
   */
  supportedNetworkIds(): number[] {
    return this.provider.supportedNetworkIds()
  }

  /**
   * Get lending provider configuration
   * @description Access to provider configuration including defaultSlippage, provider type, etc.
   */
  get config(): LendConfig {
    return this.provider.config as LendConfig
  }
}

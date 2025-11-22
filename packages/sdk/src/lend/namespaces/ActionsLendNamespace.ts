import type { LendProvider } from '@/lend/core/LendProvider.js'
import type { BaseLendConfig, LendConfig } from '@/types/lend/index.js'

/**
 * Actions Lend Namespace
 * @description Read-only lending operations available on actions.lend
 */
export class ActionsLendNamespace<TConfig extends BaseLendConfig = LendConfig> {
  constructor(protected readonly provider: LendProvider<TConfig>) {}

  get config(): TConfig {
    return this.provider.config
  }

  // Bind to the LendProvider's methods and carry types

  getMarkets = (...args: Parameters<LendProvider<TConfig>['getMarkets']>) =>
    this.provider.getMarkets(...args)

  getMarket = (...args: Parameters<LendProvider<TConfig>['getMarket']>) =>
    this.provider.getMarket(...args)

  supportedChainIds = (
    ...args: Parameters<LendProvider<TConfig>['supportedChainIds']>
  ) => this.provider.supportedChainIds(...args)
}

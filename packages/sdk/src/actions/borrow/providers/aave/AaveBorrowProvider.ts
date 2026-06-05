import type { Address } from 'viem'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import {
  adaptAaveBorrowMarket,
  adaptAaveBorrowPosition,
  assembleAaveBorrowQuote,
} from '@/actions/borrow/providers/aave/presentation.js'
import {
  type AaveQuotePlan,
  planAaveClose,
  planAaveDepositCollateral,
  planAaveOpen,
  planAaveRepay,
  planAaveWithdrawCollateral,
} from '@/actions/borrow/providers/aave/quote.js'
import {
  fetchAaveMarketState,
  fetchAavePositionState,
} from '@/actions/borrow/providers/aave/state.js'
import {
  getPoolAddress,
  getSupportedChainIds as getAaveSupportedChainIds,
} from '@/actions/shared/aave/addresses.js'
import { ChainNotSupportedError } from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { BorrowProviderConfig, BorrowSettings } from '@/types/actions.js'
import type {
  AaveBorrowMarketConfig,
  BorrowClosePositionInternalParams,
  BorrowDepositCollateralInternalParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketPosition,
  BorrowOpenPositionInternalParams,
  BorrowQuote,
  BorrowRepayInternalParams,
  BorrowWithdrawCollateralInternalParams,
  GetBorrowMarketsParams,
} from '@/types/borrow/index.js'

/**
 * Aave V3 borrow provider. Models a borrow market as the synthetic
 * (collateral, debt) reserve pair on the `aave-v3` config, read via multicall
 * against the shared Aave Pool. Variable-rate debt only.
 */
export class AaveBorrowProvider extends BorrowProvider<BorrowProviderConfig> {
  constructor(
    config: BorrowProviderConfig,
    chainManager: ChainManager,
    settings?: BorrowSettings,
  ) {
    super(config, chainManager, settings)
    // Fail fast on an aave-v3 market whose chain has no Aave deployment. Other
    // kinds belong to their own provider, so skip them.
    for (const market of config.marketAllowlist ?? []) {
      if (market.kind !== 'aave-v3') continue
      if (!getPoolAddress(market.chainId)) {
        throw new ChainNotSupportedError({
          chainId: market.chainId,
          supportedChainIds: getAaveSupportedChainIds(),
        })
      }
    }
  }

  /** Services Aave V3 borrow markets. */
  public get marketKind(): 'aave-v3' {
    return 'aave-v3'
  }

  protocolSupportedChainIds(): number[] {
    return getAaveSupportedChainIds()
  }

  // ── Read hooks ────────────────────────────────────────────────────────────

  protected async _getMarket(
    rawConfig: BorrowMarketConfig,
  ): Promise<BorrowMarket> {
    const config = this.requireAaveConfig(rawConfig)
    const client = this.chainManager.getPublicClient(config.chainId)
    const state = await fetchAaveMarketState(client, config)
    return adaptAaveBorrowMarket(
      config,
      state,
      this.resolveHealthBufferPct(config),
    )
  }

  protected async _getMarkets(
    params: GetBorrowMarketsParams,
  ): Promise<BorrowMarket[]> {
    const configs = params.markets ?? []
    const results = await Promise.allSettled(
      configs.map((rawConfig) => this._getMarket(rawConfig)),
    )
    return results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    )
  }

  protected async _getPosition(params: {
    market: BorrowMarketConfig
    walletAddress: Address
  }): Promise<BorrowMarketPosition> {
    const config = this.requireAaveConfig(params.market)
    const client = this.chainManager.getPublicClient(config.chainId)
    const state = await fetchAavePositionState(
      client,
      config,
      params.walletAddress,
    )
    return adaptAaveBorrowPosition(config, state)
  }

  // ── Write hooks ───────────────────────────────────────────────────────────

  protected async _openPosition(
    params: BorrowOpenPositionInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    return this.assembleQuote(await planAaveOpen(client, market, params))
  }

  protected async _repay(
    params: BorrowRepayInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    return this.assembleQuote(await planAaveRepay(client, market, params))
  }

  protected async _depositCollateral(
    params: BorrowDepositCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    return this.assembleQuote(
      await planAaveDepositCollateral(client, market, params),
    )
  }

  protected async _withdrawCollateral(
    params: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    return this.assembleQuote(
      await planAaveWithdrawCollateral(client, market, params),
    )
  }

  protected async _closePosition(
    params: BorrowClosePositionInternalParams,
  ): Promise<BorrowQuote> {
    const market = this.requireAaveConfig(params.market)
    const client = this.chainManager.getPublicClient(market.chainId)
    return this.assembleQuote(await planAaveClose(client, market, params))
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private requireAaveConfig(
    config: BorrowMarketConfig,
  ): AaveBorrowMarketConfig {
    if (config.kind !== 'aave-v3') {
      throw new Error(
        `AaveBorrowProvider received a ${config.kind} market config`,
      )
    }
    return config
  }

  private assembleQuote(plan: AaveQuotePlan): BorrowQuote {
    return assembleAaveBorrowQuote({
      ...plan,
      quoteExpirationSeconds: this.quoteExpirationSeconds,
      healthBufferPct: this.resolveHealthBufferPct(plan.market),
    })
  }
}

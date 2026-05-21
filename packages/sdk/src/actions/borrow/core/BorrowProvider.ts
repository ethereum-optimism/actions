import type { Address } from 'viem'

import { filterBorrowMarketConfigs } from '@/actions/borrow/core/helpers.js'
import type { ResolvedBorrowBaseParams } from '@/actions/borrow/core/internalParams.js'
import {
  buildClosePositionInternalParams,
  buildDepositCollateralInternalParams,
  buildOpenPositionInternalParams,
  buildRepayInternalParams,
  buildResolvedBorrowBaseParams,
  buildWithdrawCollateralInternalParams,
} from '@/actions/borrow/core/internalParams.js'
import {
  requireAllowlistedBorrowMarketConfig,
  validateBorrowMarketAllowed,
  validateBorrowMarketIdAllowed,
  validateBorrowWalletAddress,
} from '@/actions/borrow/core/validations.js'
import { BaseActionProvider } from '@/actions/shared/BaseActionProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { BorrowProviderConfig, BorrowSettings } from '@/types/actions.js'
import type {
  BorrowClosePositionInternalParams,
  BorrowClosePositionParams,
  BorrowDepositCollateralInternalParams,
  BorrowDepositCollateralParams,
  BorrowMarket,
  BorrowMarketConfig,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowOpenPositionBaseParams,
  BorrowOpenPositionInternalParams,
  BorrowOpenPositionParams,
  BorrowQuote,
  BorrowRepayInternalParams,
  BorrowRepayParams,
  BorrowWithdrawCollateralInternalParams,
  BorrowWithdrawCollateralParams,
  GetBorrowMarketsParams,
  GetBorrowPositionParams,
} from '@/types/borrow/index.js'
import { validateChainSupported } from '@/utils/validation.js'

/** Hardcoded fallbacks when neither provider config nor shared settings set a value. */
const DEFAULTS = {
  quoteExpirationSeconds: 30,
  healthBufferPct: 0.05,
} as const

/**
 * Abstract base class for borrow providers.
 * @description Owns amount normalization, market allowlist enforcement, and
 * the public API surface that `WalletBorrowNamespace` and
 * `ActionsBorrowNamespace` consume. Concrete providers (e.g.
 * `MorphoBorrowProvider`) implement the protected `_*` hooks that produce
 * protocol-specific calldata and read on-chain state.
 *
 * Settings resolve via precedence: per-call → provider → shared settings →
 * hardcoded default.
 */
export abstract class BorrowProvider<
  TConfig extends BorrowProviderConfig = BorrowProviderConfig,
> extends BaseActionProvider<TConfig, BorrowSettings> {
  protected constructor(
    config: TConfig,
    chainManager: ChainManager,
    settings?: BorrowSettings,
  ) {
    super(config, chainManager, settings)
  }

  /** Resolved quote expiration in seconds: provider → settings → 30. */
  public get quoteExpirationSeconds(): number {
    return (
      this._config.quoteExpirationSeconds ??
      this._settings.quoteExpirationSeconds ??
      DEFAULTS.quoteExpirationSeconds
    )
  }

  /** Resolved shared health-buffer default: settings → 0.05. */
  public get defaultHealthBufferPct(): number {
    return this._settings.healthBufferPct ?? DEFAULTS.healthBufferPct
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public action methods
  // ─────────────────────────────────────────────────────────────────────────

  public async openPosition(
    params: BorrowOpenPositionParams,
  ): Promise<BorrowQuote> {
    const { market, base } = this.resolveTrustedBaseParams(params)
    return this._openPosition(
      buildOpenPositionInternalParams({ ...params, market }, base),
    )
  }

  public async closePosition(
    params: BorrowClosePositionParams,
  ): Promise<BorrowQuote> {
    const { market, base } = this.resolveTrustedBaseParams(params)
    return this._closePosition(
      buildClosePositionInternalParams({ ...params, market }, base),
    )
  }

  public async depositCollateral(
    params: BorrowDepositCollateralParams,
  ): Promise<BorrowQuote> {
    const { market, base } = this.resolveTrustedBaseParams(params)
    return this._depositCollateral(
      buildDepositCollateralInternalParams({ ...params, market }, base),
    )
  }

  public async withdrawCollateral(
    params: BorrowWithdrawCollateralParams,
  ): Promise<BorrowQuote> {
    const { market, base } = this.resolveTrustedBaseParams(params)
    return this._withdrawCollateral(
      buildWithdrawCollateralInternalParams({ ...params, market }, base),
    )
  }

  public async repay(params: BorrowRepayParams): Promise<BorrowQuote> {
    const { market, base } = this.resolveTrustedBaseParams(params)
    return this._repay(buildRepayInternalParams({ ...params, market }, base))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public read methods
  // ─────────────────────────────────────────────────────────────────────────

  public async getMarket(marketId: BorrowMarketId): Promise<BorrowMarket> {
    validateChainSupported(marketId.chainId, this.supportedChainIds())
    const market = this.requireAllowlistedMarketConfig(marketId)
    return this._getMarket(market)
  }

  public async getMarkets(
    params: GetBorrowMarketsParams = {},
  ): Promise<BorrowMarket[]> {
    if (params.chainId !== undefined) {
      validateChainSupported(params.chainId, this.supportedChainIds())
    }
    const filtered = this.filterMarketConfigs(params)
    return this._getMarkets({
      ...params,
      markets: params.markets ?? filtered,
    })
  }

  public async getPosition(
    params: GetBorrowPositionParams,
  ): Promise<BorrowMarketPosition> {
    validateBorrowWalletAddress(params.walletAddress)
    validateChainSupported(params.marketId.chainId, this.supportedChainIds())
    const market = this.requireAllowlistedMarketConfig(params.marketId)
    return this._getPosition({ market, walletAddress: params.walletAddress })
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Protected helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resolve the health-buffer percentage for a market.
   * @description Precedence: per-market override → shared settings → `0.05`.
   */
  protected resolveHealthBufferPct(market: BorrowMarketConfig): number {
    return market.healthBufferPct ?? this.defaultHealthBufferPct
  }

  protected validateMarketAllowed(market: BorrowMarketConfig): void {
    validateBorrowMarketAllowed(market, this._config)
  }

  protected validateMarketIdAllowed(marketId: BorrowMarketId): void {
    validateBorrowMarketIdAllowed(marketId, this._config)
  }

  /**
   * Resolve a `BorrowMarketId` to its full `BorrowMarketConfig` from the
   * provider allowlist; throws `MarketNotAllowedError` when missing.
   * @description Subclasses receive the resolved config via the `_*`
   * hooks, so concrete providers don't repeat the lookup.
   */
  protected requireAllowlistedMarketConfig(
    marketId: BorrowMarketId,
  ): BorrowMarketConfig {
    return requireAllowlistedBorrowMarketConfig(
      marketId,
      this._config.marketAllowlist,
    )
  }

  /**
   * Filter the configured allowlist by `getMarkets` query parameters.
   */
  protected filterMarketConfigs(
    params: GetBorrowMarketsParams,
  ): BorrowMarketConfig[] {
    return filterBorrowMarketConfigs(this._config, params)
  }

  /**
   * Validate the cross-cutting fields every write action shares and
   * resolve a *trusted* `BorrowMarketConfig` from the allowlist by
   * `marketId`. Returning the allowlisted config — rather than trusting
   * `params.market.marketParams` — prevents a caller from tampering with
   * the on-chain market identity (e.g. swapping `marketParams.loanToken`
   * for an attacker token while keeping a legitimate `marketId`).
   */
  private resolveTrustedBaseParams(params: BorrowOpenPositionBaseParams): {
    market: BorrowMarketConfig
    base: ResolvedBorrowBaseParams
  } {
    validateBorrowWalletAddress(params.walletAddress)
    validateChainSupported(params.market.chainId, this.supportedChainIds())
    // `validateMarketAllowed` also enforces the blocklist; the allowlist
    // lookup below returns the trusted config used for the rest of the call.
    this.validateMarketAllowed(params.market)
    const market = this.requireAllowlistedMarketConfig(params.market)
    const base = buildResolvedBorrowBaseParams(
      params.walletAddress,
      this.resolveApprovalMode(params.approvalMode),
    )
    return { market, base }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Abstract action hooks — implemented per protocol
  // ─────────────────────────────────────────────────────────────────────────

  protected abstract _openPosition(
    params: BorrowOpenPositionInternalParams,
  ): Promise<BorrowQuote>

  protected abstract _closePosition(
    params: BorrowClosePositionInternalParams,
  ): Promise<BorrowQuote>

  protected abstract _depositCollateral(
    params: BorrowDepositCollateralInternalParams,
  ): Promise<BorrowQuote>

  protected abstract _withdrawCollateral(
    params: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote>

  protected abstract _repay(
    params: BorrowRepayInternalParams,
  ): Promise<BorrowQuote>

  // ─────────────────────────────────────────────────────────────────────────
  // Abstract read hooks
  // ─────────────────────────────────────────────────────────────────────────

  protected abstract _getMarket(
    market: BorrowMarketConfig,
  ): Promise<BorrowMarket>

  protected abstract _getMarkets(
    params: GetBorrowMarketsParams,
  ): Promise<BorrowMarket[]>

  protected abstract _getPosition(params: {
    market: BorrowMarketConfig
    walletAddress: Address
  }): Promise<BorrowMarketPosition>
}

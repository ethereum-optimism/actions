import { filterBorrowMarketConfigs } from '@/actions/borrow/core/helpers.js'
import {
  buildClosePositionInternalParams,
  buildDepositCollateralInternalParams,
  buildOpenPositionInternalParams,
  buildRepayInternalParams,
  buildResolvedBorrowBaseParams,
  buildWithdrawCollateralInternalParams,
} from '@/actions/borrow/core/internalParams.js'
import {
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
    return this._openPosition(
      buildOpenPositionInternalParams(params, this.normalizeBaseParams(params)),
    )
  }

  public async closePosition(
    params: BorrowClosePositionParams,
  ): Promise<BorrowQuote> {
    return this._closePosition(
      buildClosePositionInternalParams(
        params,
        this.normalizeBaseParams(params),
      ),
    )
  }

  public async depositCollateral(
    params: BorrowDepositCollateralParams,
  ): Promise<BorrowQuote> {
    return this._depositCollateral(
      buildDepositCollateralInternalParams(
        params,
        this.normalizeBaseParams(params),
      ),
    )
  }

  public async withdrawCollateral(
    params: BorrowWithdrawCollateralParams,
  ): Promise<BorrowQuote> {
    return this._withdrawCollateral(
      buildWithdrawCollateralInternalParams(
        params,
        this.normalizeBaseParams(params),
      ),
    )
  }

  public async repay(params: BorrowRepayParams): Promise<BorrowQuote> {
    return this._repay(
      buildRepayInternalParams(params, this.normalizeBaseParams(params)),
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public read methods
  // ─────────────────────────────────────────────────────────────────────────

  public async getMarket(marketId: BorrowMarketId): Promise<BorrowMarket> {
    validateChainSupported(marketId.chainId, this.supportedChainIds())
    this.validateMarketIdAllowed(marketId)
    return this._getMarket(marketId)
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
    this.validateMarketIdAllowed(params.marketId)
    return this._getPosition(params)
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

  /**
   * Validate that a market is allowed by this provider's allowlist and
   * neither chain- nor block-listed.
   */
  protected validateConfigSupported(market: BorrowMarketConfig): void {
    validateChainSupported(market.chainId, this.supportedChainIds())
    this.validateMarketAllowed(market)
  }

  protected validateMarketAllowed(market: BorrowMarketConfig): void {
    validateBorrowMarketAllowed(market, this._config)
  }

  protected validateMarketIdAllowed(marketId: BorrowMarketId): void {
    validateBorrowMarketIdAllowed(marketId, this._config)
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
   * Validate + resolve the cross-cutting fields every action shares
   * (walletAddress, recipient, approvalMode, market support).
   */
  private normalizeBaseParams(params: BorrowOpenPositionBaseParams) {
    validateBorrowWalletAddress(params.walletAddress)
    this.validateConfigSupported(params.market)
    return buildResolvedBorrowBaseParams(
      params.walletAddress,
      this.resolveApprovalMode(params.approvalMode),
    )
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

  protected abstract _getMarket(marketId: BorrowMarketId): Promise<BorrowMarket>

  protected abstract _getMarkets(
    params: GetBorrowMarketsParams,
  ): Promise<BorrowMarket[]>

  protected abstract _getPosition(
    params: GetBorrowPositionParams,
  ): Promise<BorrowMarketPosition>
}

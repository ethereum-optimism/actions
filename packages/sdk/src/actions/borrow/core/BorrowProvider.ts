import type { Address } from 'viem'

import type { ResolvedBorrowBaseParams } from '@/actions/borrow/core/internalParams.js'
import {
  buildClosePositionInternalParams,
  buildDepositCollateralInternalParams,
  buildOpenPositionInternalParams,
  buildRepayInternalParams,
  buildWithdrawCollateralInternalParams,
} from '@/actions/borrow/core/internalParams.js'
import {
  requireAllowlistedBorrowMarketConfig,
  validateBorrowWalletAddress,
} from '@/actions/borrow/core/validations.js'
import { BaseActionProvider } from '@/actions/shared/BaseActionProvider.js'
import { DEFAULT_QUOTE_EXPIRATION_SECONDS } from '@/actions/shared/defaults.js'
import { filterMatchingConfigs } from '@/actions/shared/marketConfigs.js'
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
  quoteExpirationSeconds: DEFAULT_QUOTE_EXPIRATION_SECONDS,
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

  /**
   * The `BorrowMarketId` discriminator this provider services. Lets the
   * namespace route a market to its provider by kind without naming concrete
   * providers, and is the fallback when a provider carries no market allowlist.
   */
  public abstract get marketKind(): BorrowMarketId['kind']

  /** Resolved quote expiration in seconds: provider → settings → `DEFAULT_QUOTE_EXPIRATION_SECONDS`. */
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

  /**
   * Open or increase a borrow position.
   * @description Validates wallet and market boundaries, normalizes amounts,
   * then delegates protocol-specific quote construction to the provider hook.
   * @param params - Borrow market, wallet, amount, and optional collateral.
   * @returns Quote containing projected position changes and execution data.
   * @throws AddressRequiredError when `walletAddress` is missing.
   * @throws ZeroAddressError when `walletAddress` is the zero address.
   * @throws ChainNotSupportedError when the market chain is unsupported.
   * @throws MarketNotAllowedError when the market is not allowlisted.
   */
  public async openPosition(
    params: BorrowOpenPositionParams,
  ): Promise<BorrowQuote> {
    const { market, base } = this.resolveTrustedBaseParams(params)
    return this._openPosition(
      buildOpenPositionInternalParams({ ...params, market }, base),
    )
  }

  /**
   * Close or reduce a borrow position.
   * @description Validates wallet and market boundaries, converts exact
   * amounts to wei, and preserves `{ max: true }` for protocol dust handling.
   * @param params - Borrow market, wallet, debt amount, and collateral amount.
   * @returns Quote containing projected position changes and execution data.
   * @throws AddressRequiredError when `walletAddress` is missing.
   * @throws ZeroAddressError when `walletAddress` is the zero address.
   * @throws ChainNotSupportedError when the market chain is unsupported.
   * @throws MarketNotAllowedError when the market is not allowlisted.
   */
  public async closePosition(
    params: BorrowClosePositionParams,
  ): Promise<BorrowQuote> {
    const { market, base } = this.resolveTrustedBaseParams(params)
    return this._closePosition(
      buildClosePositionInternalParams({ ...params, market }, base),
    )
  }

  /**
   * Add collateral to an existing or future borrow position.
   * @description Validates wallet and market boundaries, normalizes the
   * collateral amount using collateral asset decimals, and builds a quote.
   * @param params - Borrow market, wallet, and collateral amount to deposit.
   * @returns Quote containing projected position changes and execution data.
   * @throws AddressRequiredError when `walletAddress` is missing.
   * @throws ZeroAddressError when `walletAddress` is the zero address.
   * @throws ChainNotSupportedError when the market chain is unsupported.
   * @throws MarketNotAllowedError when the market is not allowlisted.
   */
  public async depositCollateral(
    params: BorrowDepositCollateralParams,
  ): Promise<BorrowQuote> {
    const { market, base } = this.resolveTrustedBaseParams(params)
    return this._depositCollateral(
      buildDepositCollateralInternalParams({ ...params, market }, base),
    )
  }

  /**
   * Withdraw collateral from a borrow position.
   * @description Validates wallet and market boundaries, converts exact
   * amounts to wei, and preserves `{ max: true }` for full withdrawals.
   * @param params - Borrow market, wallet, and collateral amount to withdraw.
   * @returns Quote containing projected position changes and execution data.
   * @throws AddressRequiredError when `walletAddress` is missing.
   * @throws ZeroAddressError when `walletAddress` is the zero address.
   * @throws ChainNotSupportedError when the market chain is unsupported.
   * @throws MarketNotAllowedError when the market is not allowlisted.
   */
  public async withdrawCollateral(
    params: BorrowWithdrawCollateralParams,
  ): Promise<BorrowQuote> {
    const { market, base } = this.resolveTrustedBaseParams(params)
    return this._withdrawCollateral(
      buildWithdrawCollateralInternalParams({ ...params, market }, base),
    )
  }

  /**
   * Repay debt on a borrow position.
   * @description Validates wallet and market boundaries, converts exact
   * amounts to wei, and preserves `{ max: true }` for full repayments.
   * @param params - Borrow market, wallet, and repayment amount.
   * @returns Quote containing projected position changes and execution data.
   * @throws AddressRequiredError when `walletAddress` is missing.
   * @throws ZeroAddressError when `walletAddress` is the zero address.
   * @throws ChainNotSupportedError when the market chain is unsupported.
   * @throws MarketNotAllowedError when the market is not allowlisted.
   */
  public async repay(params: BorrowRepayParams): Promise<BorrowQuote> {
    const { market, base } = this.resolveTrustedBaseParams(params)
    return this._repay(buildRepayInternalParams({ ...params, market }, base))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public read methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Read one configured borrow market.
   * @description Resolves the market from the provider allowlist before
   * delegating to the concrete protocol reader.
   * @param marketId - Market identifier to read.
   * @returns Borrow market data for the requested market.
   * @throws ChainNotSupportedError when the market chain is unsupported.
   * @throws MarketNotAllowedError when the market is not allowlisted.
   */
  public async getMarket(marketId: BorrowMarketId): Promise<BorrowMarket> {
    validateChainSupported(marketId.chainId, this.supportedChainIds())
    const market = this.requireAllowlistedMarketConfig(marketId)
    return this._getMarket(market)
  }

  /**
   * List configured borrow markets.
   * @description Applies optional client-side filters against the provider
   * allowlist before delegating protocol reads to the concrete provider.
   * @param params - Optional chain and asset filters.
   * @returns Borrow markets matching the supplied filters.
   * @throws ChainNotSupportedError when a requested chain is unsupported.
   */
  public async getMarkets(
    params: GetBorrowMarketsParams = {},
  ): Promise<BorrowMarket[]> {
    if (params.chainId !== undefined) {
      validateChainSupported(params.chainId, this.supportedChainIds())
    }
    const filtered = filterMatchingConfigs(this._config.marketAllowlist, [
      params.chainId === undefined
        ? undefined
        : (market) => market.chainId === params.chainId,
      params.collateralAsset === undefined
        ? undefined
        : (market) => market.collateralAsset === params.collateralAsset,
      params.borrowAsset === undefined
        ? undefined
        : (market) => market.borrowAsset === params.borrowAsset,
    ])
    return this._getMarkets({
      ...params,
      markets: params.markets ?? filtered,
    })
  }

  /**
   * Read a wallet position in a configured borrow market.
   * @description Validates wallet, chain, and allowlist boundaries before
   * delegating to the concrete protocol reader.
   * @param params - Market identifier and wallet address to inspect.
   * @returns Wallet position data for the requested market.
   * @throws AddressRequiredError when `walletAddress` is missing.
   * @throws ZeroAddressError when `walletAddress` is the zero address.
   * @throws ChainNotSupportedError when the market chain is unsupported.
   * @throws MarketNotAllowedError when the market is not allowlisted.
   */
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

  /**
   * Resolve a `BorrowMarketId` to its trusted `BorrowMarketConfig` from
   * the provider allowlist; throws `MarketNotAllowedError` when missing
   * or when the marketId is on the blocklist.
   * @description Subclasses receive the resolved config via the `_*`
   * hooks, so concrete providers don't repeat the lookup.
   */
  private requireAllowlistedMarketConfig(
    marketId: BorrowMarketId,
  ): BorrowMarketConfig {
    return requireAllowlistedBorrowMarketConfig(marketId, this._config)
  }

  /**
   * Validate the cross-cutting fields every write action shares and
   * resolve a *trusted* `BorrowMarketConfig` from the allowlist by
   * `marketId`. Returning the allowlisted config (rather than trusting
   * `params.market.marketParams`) prevents a caller from tampering with
   * the on-chain market identity (e.g. swapping `marketParams.loanToken`
   * for an attacker token while keeping a legitimate `marketId`).
   */
  private resolveTrustedBaseParams(params: BorrowOpenPositionBaseParams): {
    market: BorrowMarketConfig
    base: ResolvedBorrowBaseParams
  } {
    validateBorrowWalletAddress(params.walletAddress)
    validateChainSupported(params.market.chainId, this.supportedChainIds())
    const market = this.requireAllowlistedMarketConfig(params.market)
    const base: ResolvedBorrowBaseParams = {
      walletAddress: params.walletAddress,
      approvalMode: this.resolveApprovalMode(params.approvalMode),
    }
    return { market, base }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Abstract action hooks (implemented per protocol)
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

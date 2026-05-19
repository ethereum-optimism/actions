import { type Address, parseUnits } from 'viem'

import { marketIdMatches } from '@/actions/borrow/core/marketId.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { SUPPORTED_CHAIN_IDS } from '@/constants/supportedChains.js'
import {
  AddressRequiredError,
  MarketNotAllowedError,
} from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  ApprovalMode,
  BorrowProviderConfig,
  BorrowSettings,
} from '@/types/actions.js'
import type {
  Amount,
  AmountOrMax,
  AmountWeiOrMax,
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
import { resolveApprovalMode } from '@/utils/approve.js'
import {
  validateChainSupported,
  validateNotZeroAddress,
} from '@/utils/validation.js'

/** Hardcoded fallbacks when neither provider config nor shared settings set a value. */
const DEFAULTS = {
  quoteExpirationSeconds: 30,
  healthBufferPct: 0.05,
  approvalMode: 'exact' as ApprovalMode,
} as const

/**
 * Abstract base class for borrow providers.
 * @description Owns approval-mode cascading, amount normalization, market
 * allowlist enforcement, chain validation, and the public API surface that
 * `WalletBorrowNamespace` and `ActionsBorrowNamespace` consume. Concrete
 * providers (e.g. `MorphoBorrowProvider`) implement the protected `_*`
 * hooks that produce protocol-specific calldata and read on-chain state.
 *
 * Settings resolve via precedence: per-call → provider → shared settings →
 * hardcoded default.
 */
export abstract class BorrowProvider<
  TConfig extends BorrowProviderConfig = BorrowProviderConfig,
> {
  protected readonly _config: TConfig
  protected readonly _settings: BorrowSettings
  protected readonly chainManager: ChainManager

  protected constructor(
    config: TConfig,
    chainManager: ChainManager,
    settings?: BorrowSettings,
  ) {
    this._config = config
    this._settings = settings ?? {}
    this.chainManager = chainManager
  }

  public get config(): TConfig {
    return this._config
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

  /**
   * Effective supported chain IDs.
   * @description Intersection of the protocol's supported chains, the SDK's
   * supported chains, and the developer's configured chains.
   */
  public supportedChainIds(): SupportedChainId[] {
    const configured = this.chainManager.getSupportedChains()
    return this.protocolSupportedChainIds().filter(
      (id): id is SupportedChainId =>
        (SUPPORTED_CHAIN_IDS as readonly number[]).includes(id) &&
        (configured as readonly number[]).includes(id),
    )
  }

  public isChainSupported(chainId: number): boolean {
    return (this.supportedChainIds() as readonly number[]).includes(chainId)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public action methods
  // ─────────────────────────────────────────────────────────────────────────

  public async openPosition(
    params: BorrowOpenPositionParams,
  ): Promise<BorrowQuote> {
    const base = this.normalizeBaseParams(params)
    const borrowAmountWei = this.resolveAmountWei(
      params.borrowAmount,
      params.market.borrowAsset.metadata.decimals,
    )
    const collateralAmountWei =
      params.collateralAmount === undefined
        ? undefined
        : this.resolveAmountWei(
            params.collateralAmount,
            params.market.collateralAsset.metadata.decimals,
          )
    const internal: BorrowOpenPositionInternalParams = {
      market: params.market,
      walletAddress: base.walletAddress,
      recipient: base.recipient,
      options: params.options,
      approvalMode: base.approvalMode,
      borrowAmountWei,
      collateralAmountWei,
    }
    return this._openPosition(internal)
  }

  public async closePosition(
    params: BorrowClosePositionParams,
  ): Promise<BorrowQuote> {
    const base = this.normalizeBaseParams(params)
    const borrowAmount = this.resolveAmountWeiOrMax(
      params.borrowAmount,
      params.market.borrowAsset.metadata.decimals,
    )
    const collateralAmount =
      params.collateralAmount === undefined
        ? undefined
        : this.resolveAmountWeiOrMax(
            params.collateralAmount,
            params.market.collateralAsset.metadata.decimals,
          )
    const internal: BorrowClosePositionInternalParams = {
      market: params.market,
      walletAddress: base.walletAddress,
      recipient: base.recipient,
      options: params.options,
      approvalMode: base.approvalMode,
      borrowAmount,
      collateralAmount,
    }
    return this._closePosition(internal)
  }

  public async depositCollateral(
    params: BorrowDepositCollateralParams,
  ): Promise<BorrowQuote> {
    const base = this.normalizeBaseParams(params)
    const amountWei = this.resolveAmountWei(
      params.amount,
      params.market.collateralAsset.metadata.decimals,
    )
    const internal: BorrowDepositCollateralInternalParams = {
      market: params.market,
      walletAddress: base.walletAddress,
      recipient: base.recipient,
      options: params.options,
      approvalMode: base.approvalMode,
      amountWei,
    }
    return this._depositCollateral(internal)
  }

  public async withdrawCollateral(
    params: BorrowWithdrawCollateralParams,
  ): Promise<BorrowQuote> {
    const base = this.normalizeBaseParams(params)
    const amount = this.resolveAmountWeiOrMax(
      params.amount,
      params.market.collateralAsset.metadata.decimals,
    )
    const internal: BorrowWithdrawCollateralInternalParams = {
      market: params.market,
      walletAddress: base.walletAddress,
      recipient: base.recipient,
      options: params.options,
      approvalMode: base.approvalMode,
      amount,
    }
    return this._withdrawCollateral(internal)
  }

  public async repay(params: BorrowRepayParams): Promise<BorrowQuote> {
    const base = this.normalizeBaseParams(params)
    const amount = this.resolveAmountWeiOrMax(
      params.amount,
      params.market.borrowAsset.metadata.decimals,
    )
    const internal: BorrowRepayInternalParams = {
      market: params.market,
      walletAddress: base.walletAddress,
      recipient: base.recipient,
      options: params.options,
      approvalMode: base.approvalMode,
      amount,
    }
    return this._repay(internal)
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
    if (!params.walletAddress) {
      throw new AddressRequiredError('walletAddress')
    }
    validateNotZeroAddress(params.walletAddress, 'walletAddress')
    validateChainSupported(params.marketId.chainId, this.supportedChainIds())
    this.validateMarketIdAllowed(params.marketId)
    return this._getPosition(params)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Protected helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resolve the effective approval mode for a call.
   * @description Precedence: per-call → provider config → shared settings →
   * `"exact"`. Mirrors the lend and swap providers' cascading.
   */
  protected resolveApprovalMode(perCall?: ApprovalMode): ApprovalMode {
    return resolveApprovalMode(
      perCall,
      this._config.approvalMode,
      this._settings.approvalMode,
    )
  }

  /**
   * Resolve the health-buffer percentage for a market.
   * @description Precedence: per-market override → shared settings → `0.05`.
   */
  protected resolveHealthBufferPct(market: BorrowMarketConfig): number {
    return market.healthBufferPct ?? this.defaultHealthBufferPct
  }

  /**
   * Convert a public `Amount` to a wei `bigint`.
   * @description `{ amountRaw }` passes through; `{ amount }` is parsed via
   * `viem.parseUnits` using the asset's decimals.
   */
  protected resolveAmountWei(amount: Amount, decimals: number): bigint {
    if ('amountRaw' in amount) return amount.amountRaw
    return parseUnits(amount.amount.toString(), decimals)
  }

  /**
   * Convert a public `AmountOrMax` to its internal wire shape.
   * @description `{ max: true }` passes through unchanged so the concrete
   * provider can re-fetch on-chain balance at bundle-build time. Other
   * variants normalize to `{ amountWei }`.
   */
  protected resolveAmountWeiOrMax(
    amount: AmountOrMax,
    decimals: number,
  ): AmountWeiOrMax {
    if ('max' in amount) return { max: true }
    return { amountWei: this.resolveAmountWei(amount, decimals) }
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
    const allowlist = this._config.marketAllowlist
    if (allowlist && allowlist.length > 0) {
      const hit = allowlist.find((m) => marketsMatch(m, market))
      if (!hit) {
        throw new MarketNotAllowedError({
          address: market.marketId,
          chainId: market.chainId,
          reason: 'Market is not in the marketAllowlist',
        })
      }
    }

    const blocklist = this._config.marketBlocklist
    if (blocklist?.length) {
      const blocked = blocklist.find((m) => marketsMatch(m, market))
      if (blocked) {
        throw new MarketNotAllowedError({
          address: market.marketId,
          chainId: market.chainId,
          reason: 'Market is on the marketBlocklist',
        })
      }
    }
  }

  protected validateMarketIdAllowed(marketId: BorrowMarketId): void {
    const allowlist = this._config.marketAllowlist
    if (allowlist && allowlist.length > 0) {
      const hit = allowlist.find((m) => marketIdMatches(m, marketId))
      if (!hit) {
        throw new MarketNotAllowedError({
          address: marketId.marketId,
          chainId: marketId.chainId,
          reason: 'Market is not in the marketAllowlist',
        })
      }
    }
  }

  /**
   * Filter the configured allowlist by `getMarkets` query parameters.
   */
  protected filterMarketConfigs(
    params: GetBorrowMarketsParams,
  ): BorrowMarketConfig[] {
    let configs = this._config.marketAllowlist ?? []
    if (params.chainId !== undefined) {
      configs = configs.filter((m) => m.chainId === params.chainId)
    }
    if (params.collateralAsset !== undefined) {
      configs = configs.filter(
        (m) => m.collateralAsset === params.collateralAsset,
      )
    }
    if (params.borrowAsset !== undefined) {
      configs = configs.filter((m) => m.borrowAsset === params.borrowAsset)
    }
    return configs
  }

  /**
   * Validate + resolve the cross-cutting fields every action shares
   * (walletAddress, recipient, approvalMode, market support).
   */
  private normalizeBaseParams(params: BorrowOpenPositionBaseParams): {
    walletAddress: Address
    recipient: Address
    approvalMode: ApprovalMode
  } {
    if (!params.walletAddress) {
      throw new AddressRequiredError('walletAddress')
    }
    validateNotZeroAddress(params.walletAddress, 'walletAddress')
    this.validateConfigSupported(params.market)
    return {
      walletAddress: params.walletAddress,
      // Recipient defaults to the wallet. WalletBorrowNamespace binds this
      // explicitly via the wallet's address; direct callers can supply
      // `walletAddress` and receive funds at the same address.
      recipient: params.walletAddress,
      approvalMode: this.resolveApprovalMode(params.approvalMode),
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Abstract protocol-supported chain hook
  // ─────────────────────────────────────────────────────────────────────────

  public abstract protocolSupportedChainIds(): number[]

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

function marketsMatch(a: BorrowMarketConfig, b: BorrowMarketConfig): boolean {
  return marketIdMatches(a, b)
}

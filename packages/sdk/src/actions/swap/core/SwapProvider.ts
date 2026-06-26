import type { Address } from 'viem'
import { formatUnits } from 'viem'

import { BaseActionProvider } from '@/actions/shared/BaseActionProvider.js'
import { DEFAULT_QUOTE_EXPIRATION_SECONDS } from '@/actions/shared/defaults.js'
import { findMatchingConfig } from '@/actions/shared/marketConfigs.js'
import { QUOTE_DISCRIMINATOR } from '@/actions/shared/quoteDiscriminator.js'
import { UNIVERSAL_ROUTER_MSG_SENDER } from '@/actions/swap/core/markets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  InvalidParamsError,
  MarketNotAllowedError,
  ProviderNotConfiguredError,
  QuoteRecipientMissingError,
} from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  SwapExecuteParamsResolved,
  SwapQuoteParamsResolved,
} from '@/services/nameservices/ens/types.js'
import type { ApprovalMode, SwapSettings } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  ResolvedSwapParams,
  SwapExecuteParams,
  SwapMarket,
  SwapMarketConfig,
  SwapProviderConfig,
  SwapQuote,
  SwapTransaction,
  SwapTransactionData,
} from '@/types/swap/index.js'
import type { TransactionData } from '@/types/transaction.js'
import {
  buildPermit2ApprovalTx,
  buildTokenApprovalTx,
  checkPermit2Allowance,
  checkTokenAllowance,
  resolveErc20ApprovalAmount,
  resolvePermit2ApprovalAmount,
} from '@/utils/approve.js'
import {
  getAssetAddress,
  isNativeAsset,
  parseAssetAmount,
} from '@/utils/assets.js'
import {
  validateAmountPositiveIfExists,
  validateAmountProvided,
  validateAssetOnChain,
  validateNotBothAmounts,
  validateNotSameAsset,
  validateNotZeroAddress,
  validateQuoteNotExpired,
  validateRecipient,
  validateSlippage,
  validateWalletAddress,
} from '@/utils/validation.js'

/** Hardcoded fallbacks when neither provider nor global config sets a value */
const DEFAULTS = {
  slippage: 0.005,
  maxSlippage: 0.5,
  quoteExpirationSeconds: DEFAULT_QUOTE_EXPIRATION_SECONDS,
  permit2ExpirationSeconds: 2_592_000, // 30 days
} as const

/** Basis points denominator for slippage calculations (1 bp = 0.01%) */
const BPS_DENOMINATOR = 10000n

/**
 * Abstract base class for swap providers.
 * Public methods handle validation and conversion,
 * protected abstract methods implement provider-specific logic.
 *
 * Settings are resolved with provider → global → hardcoded default precedence.
 */
export abstract class SwapProvider<
  TConfig extends SwapProviderConfig = SwapProviderConfig,
> extends BaseActionProvider<TConfig, SwapSettings> {
  protected constructor(
    config: TConfig,
    chainManager: ChainManager,
    settings?: SwapSettings,
  ) {
    super(config, chainManager, settings)
  }

  /** Resolved default slippage: provider → global → 0.005 */
  get defaultSlippage(): number {
    return (
      this._config.defaultSlippage ??
      this._settings.defaultSlippage ??
      DEFAULTS.slippage
    )
  }

  /** Resolved max slippage: provider → global → 0.5 */
  get maxSlippage(): number {
    return (
      this._config.maxSlippage ??
      this._settings.maxSlippage ??
      DEFAULTS.maxSlippage
    )
  }

  /** Resolved quote expiration in seconds: provider → global → `DEFAULT_QUOTE_EXPIRATION_SECONDS`. */
  get quoteExpirationSeconds(): number {
    return (
      this._config.quoteExpirationSeconds ??
      this._settings.quoteExpirationSeconds ??
      DEFAULTS.quoteExpirationSeconds
    )
  }

  /** Resolved Permit2 sub-approval expiration in seconds: provider → global → 30 days */
  get permit2ExpirationSeconds(): number {
    return (
      (this._config as { permit2ExpirationSeconds?: number })
        .permit2ExpirationSeconds ??
      this._settings.permit2ExpirationSeconds ??
      DEFAULTS.permit2ExpirationSeconds
    )
  }

  /**
   * Execute a token swap.
   * Accepts either raw params (re-quotes internally) or a pre-built SwapQuote (skips re-quoting).
   * @param params - Swap parameters or a pre-built SwapQuote from getQuote()
   * @returns Transaction data ready for wallet execution
   */
  async execute(
    params: SwapExecuteParamsResolved | SwapQuote,
  ): Promise<SwapTransaction> {
    // Resolve approval mode once at entry; the resolved value is set back on
    // the params object so all downstream methods read a single populated field.
    const resolvedApprovalMode = this.resolveApprovalMode(params.approvalMode)

    if (QUOTE_DISCRIMINATOR in params) {
      this.validateSwapExecute(params)
      return this.executeFromQuote({
        ...params,
        approvalMode: resolvedApprovalMode,
      })
    }

    this.validateSwapExecute(params)

    // Raw params only
    validateNotBothAmounts(params.amountIn, params.amountOut)
    validateWalletAddress(params.walletAddress)
    return this._execute(
      this.resolveParams({ ...params, approvalMode: resolvedApprovalMode }),
    )
  }

  /**
   * Get a full swap quote with pre-built execution data.
   * The returned SwapQuote can be passed directly to execute() to skip re-quoting.
   * @param params - Quote parameters (assets, amounts, chain, slippage)
   * @returns SwapQuote with pricing, amounts, and pre-encoded calldata
   */
  async getQuote(params: SwapQuoteParamsResolved): Promise<SwapQuote> {
    this.assertChainSupported(params.chainId)
    // Validate slippage and amounts before quote calldata is built.
    validateNotBothAmounts(params.amountIn, params.amountOut)
    validateAmountPositiveIfExists(params.amountIn)
    validateAmountPositiveIfExists(params.amountOut)
    validateSlippage(params.slippage ?? this.defaultSlippage, this.maxSlippage)
    return this._getQuote(params)
  }

  /**
   * Get a specific swap market by ID.
   * Validates the market is not blocklisted before returning.
   * @param params - Market identifier (poolId + chainId)
   * @returns Market information including assets and fee tier
   * @throws If market is blocklisted
   */
  async getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    this.assertChainSupported(params.chainId)
    const market = await this._getMarket(params)
    this.validateMarketAllowed(
      market.assets[0],
      market.assets[1],
      params.chainId,
    )
    return market
  }

  /**
   * Get available swap markets, optionally filtered.
   * Excludes blocklisted markets from results.
   * @param params - Optional filters (chainId, asset)
   * @returns Array of non-blocked markets from this provider
   */
  async getMarkets(params: GetSwapMarketsParams = {}): Promise<SwapMarket[]> {
    if (params.chainId) {
      this.assertChainSupported(params.chainId)
    }
    const markets = await this._getMarkets(params)
    return this.filterBlockedMarkets(markets)
  }

  /**
   * Check if this provider supports a given market (asset pair on chain).
   * Returns true if the pair passes allowlist/blocklist checks.
   */
  isMarketSupported(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): boolean {
    if (!this.isChainSupported(chainId)) return false
    try {
      this.validateMarketAllowed(assetIn, assetOut, chainId)
      return true
    } catch {
      return false
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Protected helpers
  // ─────────────────────────────────────────────────────────────────────────────

  protected validateMarketAllowed(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): void {
    const { marketBlocklist, marketAllowlist } = this._config

    if (marketBlocklist?.length) {
      const isBlocked = this.findMatchingConfig(
        assetIn,
        assetOut,
        chainId,
        marketBlocklist,
      )
      if (isBlocked) {
        throw new MarketNotAllowedError({
          assetInSymbol: assetIn.metadata.symbol,
          assetOutSymbol: assetOut.metadata.symbol,
          chainId,
          reason: 'Pair is blocked',
        })
      }
    }

    if (marketAllowlist?.length) {
      const isAllowed = this.findMatchingConfig(
        assetIn,
        assetOut,
        chainId,
        marketAllowlist,
      )
      if (!isAllowed) {
        throw new MarketNotAllowedError({
          assetInSymbol: assetIn.metadata.symbol,
          assetOutSymbol: assetOut.metadata.symbol,
          chainId,
          reason: 'Pair is not in the allowlist',
        })
      }
    }
  }

  /**
   * Resolve common quote parameters with provider defaults.
   * Wallet-bound quotes default output to the executor across providers.
   * Explicit recipients still override the wallet destination.
   * @param params - Raw quote params from the user
   * @returns Resolved slippage, deadline, recipient, optional wallet address,
   * amountInRaw, and current timestamp
   */
  protected resolveQuoteDefaults(params: SwapQuoteParamsResolved) {
    const slippage = params.slippage ?? this.defaultSlippage
    const now = Math.floor(Date.now() / 1000)
    const deadline = params.deadline ?? now + this.quoteExpirationSeconds
    const recipient =
      params.recipient ?? params.walletAddress ?? UNIVERSAL_ROUTER_MSG_SENDER
    const walletAddress = params.walletAddress
    const amountInRaw = parseAssetAmount(params.assetIn, params.amountIn ?? 1)
    return { slippage, now, deadline, recipient, walletAddress, amountInRaw }
  }

  /**
   * Compute minimum output amount after slippage.
   * @param amountOutRaw - Expected output as raw bigint
   * @param slippage - Slippage tolerance as decimal (0.005 = 0.5%)
   * @param assetOut - Output asset (for decimal conversion)
   * @returns Raw and human-readable minimum output amounts
   */
  protected computeSlippageBounds(
    amountOutRaw: bigint,
    slippage: number,
    assetOut: Asset,
  ): { amountOutMinRaw: bigint; amountOutMin: number } {
    const slippageBps = this.computeSlippageBps(slippage)
    const amountOutMinRaw =
      (amountOutRaw * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR
    // Reject min-out floors that disable protection or exceed the quote.
    if (amountOutMinRaw < 0n || amountOutMinRaw > amountOutRaw) {
      throw new InvalidParamsError({
        param: 'slippage',
        expected: `amountOutMinRaw within [0, ${amountOutRaw}]`,
        received: `${amountOutMinRaw}`,
      })
    }
    const amountOutMin = parseFloat(
      formatUnits(amountOutMinRaw, assetOut.metadata.decimals),
    )
    return { amountOutMinRaw, amountOutMin }
  }

  /**
   * Compute the maximum input for an exact-output swap after slippage.
   * Symmetric to {@link computeSlippageBounds} on the input side. The ceiling
   * can only grow with slippage, so it needs no negative-floor clamp; callers
   * pass this through to the encoder so the displayed and enforced max-in are
   * the same number.
   * @param amountInRaw - Quoted input as raw bigint
   * @param slippage - Slippage tolerance as decimal (0.005 = 0.5%)
   */
  protected computeAmountInMaxRaw(
    amountInRaw: bigint,
    slippage: number,
  ): bigint {
    const slippageBps = this.computeSlippageBps(slippage)
    return (
      (amountInRaw * (BPS_DENOMINATOR + slippageBps) + BPS_DENOMINATOR - 1n) /
      BPS_DENOMINATOR
    )
  }

  protected resolveMarketConfig(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): SwapMarketConfig | undefined {
    const { marketAllowlist } = this._config
    if (!marketAllowlist?.length) {
      throw new ProviderNotConfiguredError({
        provider: 'marketAllowlist',
        details: 'Provide a marketAllowlist in swap provider config.',
      })
    }
    return this.findMatchingConfig(assetIn, assetOut, chainId, marketAllowlist)
  }

  /**
   * Build Permit2 approval transactions for an ERC20 swap input.
   * Skipped for native assets. Checks both ERC20→Permit2 and Permit2→spender allowances in parallel.
   * Uses the resolved `permit2ExpirationSeconds` from provider → global → default.
   *
   * Approval amounts honour `params.approvalMode`:
   * - `"exact"` approves only `requiredAmount` for both the outer ERC-20→Permit2
   * allowance and the inner Permit2→spender allowance. Each subsequent swap
   * needs its own approval transaction.
   * - `"max"` approves `maxUint256` for the outer ERC-20 allowance and
   * `maxUint160` (Permit2's allowance type) for the inner Permit2 allowance.
   * Subsequent swaps within the expiration window skip the re-approval round
   * trip entirely.
   * @param params - Resolved swap params (wallet address, asset info, chain, approvalMode)
   * @param requiredAmount - Amount as raw bigint that must be approved
   * @param permit2Address - Permit2 contract address
   * @param permit2Spender - The router/contract that Permit2 should approve (e.g. Universal Router)
   */
  protected async buildPermit2Approvals(
    params: ResolvedSwapParams,
    requiredAmount: bigint,
    permit2Address: Address,
    permit2Spender: Address,
  ): Promise<{
    tokenApproval: TransactionData | undefined
    permit2Approval: TransactionData | undefined
  }> {
    if (isNativeAsset(params.assetIn)) {
      return { tokenApproval: undefined, permit2Approval: undefined }
    }

    const publicClient = this.chainManager.getPublicClient(params.chainId)
    const token = getAssetAddress(params.assetIn, params.chainId)

    const [tokenAllowance, permit2Allowance] = await Promise.all([
      checkTokenAllowance({
        publicClient,
        token,
        owner: params.walletAddress,
        spender: permit2Address,
      }),
      checkPermit2Allowance({
        publicClient,
        permit2Address,
        owner: params.walletAddress,
        token,
        spender: permit2Spender,
      }),
    ])

    const tokenApproval =
      tokenAllowance < requiredAmount
        ? buildTokenApprovalTx(
            token,
            permit2Address,
            resolveErc20ApprovalAmount(params.approvalMode, requiredAmount),
          )
        : undefined

    // Permit2 expiration is in Unix seconds (matching EVM block.timestamp)
    const permit2Expired =
      permit2Allowance.expiration < Math.floor(Date.now() / 1000)
    const permit2Approval =
      permit2Allowance.amount < requiredAmount || permit2Expired
        ? buildPermit2ApprovalTx({
            permit2Address,
            token,
            spender: permit2Spender,
            amount: resolvePermit2ApprovalAmount(
              params.approvalMode,
              requiredAmount,
            ),
            expirySeconds: this.permit2ExpirationSeconds,
          })
        : undefined

    return { tokenApproval, permit2Approval }
  }

  /**
   * Build a SwapTransaction from a quote by fetching approvals and wrapping
   * the swap calldata. Used by both the quote-execute path and provider
   * `_execute` implementations. Quotes are required to have `recipient` set by
   * the provider's `_getQuote`; providers can use `walletAddress` for signer
   * and allowance ownership when present. Reads `quote.approvalMode`
   * (populated by `execute()` at entry).
   * @param quote - SwapQuote with recipient and approvalMode set
   */
  protected async buildSwapTransactions(
    quote: SwapQuote,
  ): Promise<SwapTransaction> {
    if (!quote.recipient) {
      throw new QuoteRecipientMissingError()
    }
    const approvals = await this._buildApprovals(quote)

    const swapTx: TransactionData = {
      to: quote.execution.routerAddress,
      data: quote.execution.swapCalldata,
      value: quote.execution.value,
    }

    return {
      amountIn: quote.amountIn,
      amountOut: quote.amountOut,
      amountInRaw: quote.amountInRaw,
      amountOutRaw: quote.amountOutRaw,
      assetIn: quote.assetIn,
      assetOut: quote.assetOut,
      price: quote.price,
      priceImpact: quote.priceImpact,
      transactionData: { ...approvals, swap: swapTx },
    }
  }

  /**
   * Resolve the wallet that owns input tokens for a quote.
   * @param quote - Swap quote being executed
   * @returns Wallet address for allowance checks
   */
  protected resolveQuoteWalletAddress(quote: SwapQuote): Address {
    return quote.walletAddress ?? quote.recipient
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  // Safe but not ideal, flooring to whole bps is conservative because it tightens bounds. This issue expands flexibility:
  // https://github.com/ethereum-optimism/actions/issues/379
  private computeSlippageBps(slippage: number): bigint {
    validateSlippage(slippage, this.maxSlippage)
    return BigInt(Math.floor(slippage * Number(BPS_DENOMINATOR)))
  }

  private async executeFromQuote(quote: SwapQuote): Promise<SwapTransaction> {
    validateQuoteNotExpired(quote.expiresAt)
    validateNotZeroAddress(quote.execution.routerAddress, 'routerAddress')
    return this.buildSwapTransactions(quote)
  }

  private validateSwapExecute(params: SwapExecuteParams | SwapQuote): void {
    validateNotSameAsset(params.assetIn, params.assetOut)
    this.assertChainSupported(params.chainId)
    this.validateMarketAllowed(params.assetIn, params.assetOut, params.chainId)
    validateAssetOnChain(params.assetIn, params.chainId)
    validateAssetOnChain(params.assetOut, params.chainId)
    validateAmountProvided(params.amountIn, params.amountOut)
    validateAmountPositiveIfExists(params.amountIn)
    validateAmountPositiveIfExists(params.amountOut)
    validateSlippage(params.slippage ?? this.defaultSlippage, this.maxSlippage)
    validateRecipient(params.recipient)
  }

  private resolveParams(
    params: SwapExecuteParamsResolved & { approvalMode: ApprovalMode },
  ): ResolvedSwapParams {
    return {
      amountInRaw: parseAssetAmount(params.assetIn, params.amountIn),
      amountOutRaw: parseAssetAmount(params.assetOut, params.amountOut),
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      slippage: params.slippage ?? this.defaultSlippage,
      deadline:
        params.deadline ??
        Math.floor(Date.now() / 1000) + this.quoteExpirationSeconds,
      // Send output tokens to specified recipient, or back to the initiating wallet
      recipient: params.recipient ?? params.walletAddress,
      walletAddress: params.walletAddress,
      chainId: params.chainId,
      approvalMode: params.approvalMode,
    }
  }

  /**
   * Filter out markets whose asset pairs appear in the blocklist.
   */
  private filterBlockedMarkets(markets: SwapMarket[]): SwapMarket[] {
    const { marketBlocklist } = this._config
    if (!marketBlocklist?.length) return markets

    return markets.filter((market) => {
      const [assetA, assetB] = market.assets
      const blocked = this.findMatchingConfig(
        assetA,
        assetB,
        market.marketId.chainId,
        marketBlocklist,
      )
      return !blocked
    })
  }

  private findMatchingConfig(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
    list: SwapMarketConfig[],
  ): SwapMarketConfig | undefined {
    const addressIn = assetIn.address[chainId]
    const addressOut = assetOut.address[chainId]
    if (!addressIn || !addressOut) return undefined

    return findMatchingConfig({
      configs: list,
      target: undefined,
      matches: (config) => {
        if (config.chainId !== undefined && config.chainId !== chainId) {
          return false
        }
        return this.containsPairByAddress(
          addressIn,
          addressOut,
          chainId,
          config.assets,
        )
      },
    })
  }

  private containsPairByAddress(
    addressIn: string,
    addressOut: string,
    chainId: SupportedChainId,
    assets: Asset[],
  ): boolean {
    const addresses = assets
      .map((a) => a.address[chainId]?.toLowerCase())
      .filter(Boolean)
    return (
      addresses.includes(addressIn.toLowerCase()) &&
      addresses.includes(addressOut.toLowerCase())
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Abstract methods (implement in provider)
  // ─────────────────────────────────────────────────────────────────────────────

  protected abstract _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction>

  protected abstract _getQuote(
    params: SwapQuoteParamsResolved,
  ): Promise<SwapQuote>

  /**
   * Build provider-specific approval transactions for a swap.
   * Called by the base class during executeFromQuote with a validated
   * recipient and resolved approvalMode. Implementations use
   * `quote.walletAddress` for allowance ownership and read
   * `quote.approvalMode` to choose between exact and max approvals.
   * @param quote - SwapQuote with recipient set by the provider's _getQuote and approvalMode populated by execute() at entry
   * @returns Approval transactions needed before the swap (tokenApproval, permit2Approval)
   */
  protected abstract _buildApprovals(
    quote: SwapQuote,
  ): Promise<Omit<SwapTransactionData, 'swap'>>

  protected abstract _getMarket(
    params: GetSwapMarketParams,
  ): Promise<SwapMarket>

  protected abstract _getMarkets(
    params: GetSwapMarketsParams,
  ): Promise<SwapMarket[]>
}

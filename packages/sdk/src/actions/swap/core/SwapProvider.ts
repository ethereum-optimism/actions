import type { Address } from 'viem'
import { formatUnits } from 'viem'

import { UNIVERSAL_ROUTER_MSG_SENDER } from '@/actions/swap/core/markets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ACTIONS_SUPPORTED_CHAIN_IDS } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  SwapExecuteParamsResolved,
  SwapQuoteParamsResolved,
} from '@/services/nameservices/ens/types.js'
import type { SwapSettings } from '@/types/actions.js'
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
  validateChainSupported,
  validateNotBothAmounts,
  validateNotSameAsset,
  validateNotZeroAddress,
  validateRecipient,
  validateSlippage,
} from '@/utils/validation.js'

/** Hardcoded fallbacks when neither provider nor global config sets a value */
const DEFAULTS = {
  slippage: 0.005,
  maxSlippage: 0.5,
  quoteExpirationSeconds: 60,
  permit2ExpirationSeconds: 2_592_000, // 30 days
} as const

/** Basis points denominator for slippage calculations (1 bp = 0.01%) */
const BPS_DENOMINATOR = 10000n

/** Field used to distinguish a SwapQuote from raw SwapExecuteParams */
export const QUOTE_DISCRIMINATOR = 'quotedAt' as const

/**
 * Abstract base class for swap providers.
 * Public methods handle validation and conversion,
 * protected abstract methods implement provider-specific logic.
 *
 * Settings are resolved with provider → global → hardcoded default precedence.
 */
export abstract class SwapProvider<
  TConfig extends SwapProviderConfig = SwapProviderConfig,
> {
  protected readonly _config: TConfig
  protected readonly _settings: SwapSettings
  protected readonly chainManager: ChainManager

  constructor(
    config: TConfig,
    chainManager: ChainManager,
    settings?: SwapSettings,
  ) {
    this._config = config
    this._settings = settings ?? {}
    this.chainManager = chainManager
  }

  get config(): TConfig {
    return this._config
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

  /** Resolved quote expiration in seconds: provider → global → 60 */
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
    if (QUOTE_DISCRIMINATOR in params) {
      this.validateSwapExecute(params)
      return this.executeFromQuote(params)
    }

    this.validateSwapExecute(params)

    // Raw params only
    validateNotBothAmounts(params.amountIn, params.amountOut)
    validateNotZeroAddress(params.walletAddress, 'walletAddress')
    return this._execute(this.resolveParams(params))
  }

  /**
   * Get a full swap quote with pre-built execution data.
   * The returned SwapQuote can be passed directly to execute() to skip re-quoting.
   * @param params - Quote parameters (assets, amounts, chain, slippage)
   * @returns SwapQuote with pricing, amounts, and pre-encoded calldata
   */
  async getQuote(params: SwapQuoteParamsResolved): Promise<SwapQuote> {
    validateChainSupported(params.chainId, this.supportedChainIds())
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
    validateChainSupported(params.chainId, this.supportedChainIds())
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
      validateChainSupported(params.chainId, this.supportedChainIds())
    }
    const markets = await this._getMarkets(params)
    return this.filterBlockedMarkets(markets)
  }

  /**
   * Effective supported chain IDs.
   * @description Intersection of the protocol's supported chains,
   * the Actions SDK's known chains, and the developer's ActionsConfig.chains.
   */
  supportedChainIds(): SupportedChainId[] {
    const configuredChains = this.chainManager.getSupportedChains()
    return this.protocolSupportedChainIds().filter(
      (id) =>
        (ACTIONS_SUPPORTED_CHAIN_IDS as readonly number[]).includes(id) &&
        configuredChains.includes(id),
    )
  }

  isChainSupported(chainId: SupportedChainId): boolean {
    return this.supportedChainIds().includes(chainId)
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
        throw new Error(
          `Pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} is blocked on chain ${chainId}`,
        )
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
        throw new Error(
          `Pair ${assetIn.metadata.symbol}/${assetOut.metadata.symbol} is not in the allowlist for chain ${chainId}`,
        )
      }
    }
  }

  /**
   * Resolve common quote parameters with provider defaults.
   * @param params - Raw quote params from the user
   * @returns Resolved slippage, deadline, recipient, amountInRaw, and current timestamp
   */
  protected resolveQuoteDefaults(params: SwapQuoteParamsResolved) {
    const slippage = params.slippage ?? this.defaultSlippage
    const now = Math.floor(Date.now() / 1000)
    const deadline = params.deadline ?? now + this.quoteExpirationSeconds
    const recipient = params.recipient ?? UNIVERSAL_ROUTER_MSG_SENDER
    const amountInRaw = parseAssetAmount(params.assetIn, params.amountIn ?? 1)
    return { slippage, now, deadline, recipient, amountInRaw }
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
    const slippageBps = BigInt(Math.round(slippage * Number(BPS_DENOMINATOR)))
    const amountOutMinRaw =
      (amountOutRaw * (BPS_DENOMINATOR - slippageBps)) / BPS_DENOMINATOR
    const amountOutMin = parseFloat(
      formatUnits(amountOutMinRaw, assetOut.metadata.decimals),
    )
    return { amountOutMinRaw, amountOutMin }
  }

  protected resolveMarketConfig(
    assetIn: Asset,
    assetOut: Asset,
    chainId: SupportedChainId,
  ): SwapMarketConfig | undefined {
    const { marketAllowlist } = this._config
    if (!marketAllowlist?.length) {
      throw new Error(
        'No markets configured. Provide a marketAllowlist in swap provider config.',
      )
    }
    return this.findMatchingConfig(assetIn, assetOut, chainId, marketAllowlist)
  }

  /**
   * Build Permit2 approval transactions for an ERC20 swap input.
   * Skipped for native assets. Checks both ERC20→Permit2 and Permit2→spender allowances in parallel.
   * Uses the resolved `permit2ExpirationSeconds` from provider → global → default.
   * @param params - Resolved swap params (wallet address, asset info, chain)
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
        ? buildTokenApprovalTx(token, permit2Address)
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
            amount: requiredAmount,
            expirySeconds: this.permit2ExpirationSeconds,
          })
        : undefined

    return { tokenApproval, permit2Approval }
  }

  /**
   * Build a SwapTransaction from a quote by fetching approvals and wrapping the swap calldata.
   * Used by both the quote-execute path and provider _execute implementations.
   * @param quote - SwapQuote with recipient set for allowance checks
   */
  protected async buildSwapTransactions(
    quote: SwapQuote,
  ): Promise<SwapTransaction> {
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

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private async executeFromQuote(quote: SwapQuote): Promise<SwapTransaction> {
    this.validateQuoteExpiration(quote)
    validateNotZeroAddress(quote.execution.routerAddress, 'routerAddress')

    if (!quote.recipient) {
      throw new Error(
        'SwapQuote.recipient is required for execution. Pass the quote through WalletSwapNamespace.execute() which injects the wallet address.',
      )
    }

    // If the recipient changed since the quote was built (e.g. quote from
    // ActionsSwapNamespace executed through WalletSwapNamespace), re-encode
    // calldata with the correct recipient to prevent tokens going to the wrong address.
    if (quote.recipient !== quote.quotedRecipient) {
      const freshQuote = await this._getQuote({
        assetIn: quote.assetIn,
        assetOut: quote.assetOut,
        amountIn: quote.amountIn,
        chainId: quote.chainId,
        slippage: quote.slippage,
        deadline: quote.deadline,
        recipient: quote.recipient,
      })
      return this.buildSwapTransactions({
        ...freshQuote,
        recipient: quote.recipient,
      })
    }

    return this.buildSwapTransactions(quote)
  }

  private validateSwapExecute(params: SwapExecuteParams | SwapQuote): void {
    validateNotSameAsset(params.assetIn, params.assetOut)
    validateChainSupported(params.chainId, this.supportedChainIds())
    this.validateMarketAllowed(params.assetIn, params.assetOut, params.chainId)
    validateAssetOnChain(params.assetIn, params.chainId)
    validateAssetOnChain(params.assetOut, params.chainId)
    validateAmountProvided(params.amountIn, params.amountOut)
    validateAmountPositiveIfExists(params.amountIn)
    validateAmountPositiveIfExists(params.amountOut)
    validateSlippage(params.slippage ?? this.defaultSlippage, this.maxSlippage)
    validateRecipient('recipient' in params ? params.recipient : undefined)
  }

  private validateQuoteExpiration(quote: SwapQuote): void {
    const now = Math.floor(Date.now() / 1000)
    if (now >= quote.expiresAt) {
      throw new Error(
        `Quote expired at ${quote.expiresAt}, current time is ${now}`,
      )
    }
  }

  private resolveParams(params: SwapExecuteParamsResolved): ResolvedSwapParams {
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

    return list.find((config) => {
      if (config.chainId !== undefined && config.chainId !== chainId)
        return false
      return this.containsPairByAddress(
        addressIn,
        addressOut,
        chainId,
        config.assets,
      )
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

  /**
   * Chain IDs supported by the underlying protocol.
   * Each provider declares the chains its protocol is deployed on,
   * without any SDK-level or developer-config filtering.
   */
  abstract protocolSupportedChainIds(): SupportedChainId[]

  protected abstract _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction>

  protected abstract _getQuote(
    params: SwapQuoteParamsResolved,
  ): Promise<SwapQuote>

  /**
   * Build provider-specific approval transactions for a swap.
   * Called by the base class during executeFromQuote with a validated recipient.
   * @param quote - SwapQuote with recipient set to the real wallet address
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

import type { Address } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ACTIONS_SUPPORTED_CHAIN_IDS } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type {
  GetSwapMarketParams,
  GetSwapMarketsParams,
  ResolvedSwapParams,
  SwapExecuteParams,
  SwapMarket,
  SwapMarketConfig,
  SwapPrice,
  SwapPriceParams,
  SwapProviderConfig,
  SwapQuote,
  SwapQuoteParams,
  SwapTransaction,
} from '@/types/swap/index.js'
import type { TransactionData } from '@/types/transaction.js'
import {
  getAssetAddress,
  isNativeAsset,
  parseAssetAmount,
} from '@/utils/assets.js'
import {
  buildPermit2ApprovalTx,
  buildTokenApprovalTx,
  checkPermit2Allowance,
  checkTokenAllowance,
} from '@/utils/permit2.js'
import {
  validateAmountPositiveIfExists,
  validateAmountProvided,
  validateAssetOnChain,
  validateChainSupported,
  validateNotBothAmounts,
  validateNotSameAsset,
  validateNotZeroAddress,
  validateSlippage,
} from '@/utils/validation.js'

const DEFAULT_SLIPPAGE = 0.005
const DEFAULT_DEADLINE_OFFSET = 60
const DEFAULT_MAX_SLIPPAGE = 0.5

/**
 * Abstract base class for swap providers.
 * Public methods handle validation and conversion,
 * protected abstract methods implement provider-specific logic.
 */
export abstract class SwapProvider<
  TConfig extends SwapProviderConfig = SwapProviderConfig,
> {
  protected readonly _config: TConfig
  protected readonly chainManager: ChainManager

  constructor(config: TConfig, chainManager: ChainManager) {
    this._config = config
    this.chainManager = chainManager
  }

  get config(): TConfig {
    return this._config
  }

  get defaultSlippage(): number {
    return this._config.defaultSlippage ?? DEFAULT_SLIPPAGE
  }

  /**
   * Execute a token swap.
   * Accepts either raw params (re-quotes internally) or a pre-built SwapQuote (skips re-quoting).
   */
  async execute(
    params: SwapExecuteParams | SwapQuote,
  ): Promise<SwapTransaction> {
    if ('execution' in params) {
      return this.executeFromQuote(params)
    }
    this.executeValidations(params)
    const resolvedParams = this.resolveParams(params)
    validateSlippage(
      resolvedParams.slippage,
      this._config.maxSlippage ?? DEFAULT_MAX_SLIPPAGE,
    )
    return this._execute(resolvedParams)
  }

  /**
   * Get a full swap quote with pre-built execution data.
   * The returned SwapQuote can be passed directly to execute() to skip re-quoting.
   */
  async getQuote(params: SwapQuoteParams): Promise<SwapQuote> {
    validateChainSupported(params.chainId, this.supportedChainIds())
    return this._getQuote(params)
  }

  /** Get price quote for a swap (display data only) */
  async getPrice(params: SwapPriceParams): Promise<SwapPrice> {
    validateChainSupported(params.chainId, this.supportedChainIds())
    return this._getPrice(params)
  }

  /** Get a specific swap market by ID */
  async getMarket(params: GetSwapMarketParams): Promise<SwapMarket> {
    validateChainSupported(params.chainId, this.supportedChainIds())
    return this._getMarket(params)
  }

  /** Get available swap markets, optionally filtered by chainId or asset */
  async getMarkets(params: GetSwapMarketsParams = {}): Promise<SwapMarket[]> {
    if (params.chainId) {
      validateChainSupported(params.chainId, this.supportedChainIds())
    }
    return this._getMarkets(params)
  }

  /**
   * Chain IDs supported by the underlying protocol.
   * @description Each provider implements this to declare the chains its protocol
   * is deployed on, without any SDK-level or developer-config filtering.
   */
  abstract protocolSupportedChainIds(): SupportedChainId[]

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
   * @param params - Resolved swap params (wallet address, asset info, chain)
   * @param requiredAmount - Amount in wei that must be approved
   * @param permit2Address - Permit2 contract address
   * @param permit2Spender - The router/contract that Permit2 should approve (e.g. Universal Router)
   * @param permit2ExpirySeconds - Optional custom expiry for the Permit2 approval
   */
  protected async buildPermit2Approvals(
    params: ResolvedSwapParams,
    requiredAmount: bigint,
    permit2Address: Address,
    permit2Spender: Address,
    permit2ExpirySeconds?: number,
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
            expirySeconds: permit2ExpirySeconds,
          })
        : undefined

    return { tokenApproval, permit2Approval }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private executeFromQuote(quote: SwapQuote): Promise<SwapTransaction> {
    const now = Math.floor(Date.now() / 1000)
    if (now >= quote.expiresAt) {
      throw new Error(
        `Quote expired at ${quote.expiresAt}, current time is ${now}`,
      )
    }
    return this._executeFromQuote(quote)
  }

  private executeValidations(params: SwapExecuteParams): void {
    validateAmountProvided(params.amountIn, params.amountOut)
    validateAmountPositiveIfExists(params.amountIn)
    validateAmountPositiveIfExists(params.amountOut)
    validateNotBothAmounts(params.amountIn, params.amountOut)
    validateNotSameAsset(params.assetIn, params.assetOut)
    validateNotZeroAddress(params.walletAddress, 'walletAddress')
    if (params.recipient) {
      validateNotZeroAddress(params.recipient, 'recipient')
    }
    validateChainSupported(params.chainId, this.supportedChainIds())
    this.validateMarketAllowed(params.assetIn, params.assetOut, params.chainId)
    validateAssetOnChain(params.assetIn, params.chainId)
    validateAssetOnChain(params.assetOut, params.chainId)
  }

  private resolveParams(params: SwapExecuteParams): ResolvedSwapParams {
    return {
      amountInWei: parseAssetAmount(params.assetIn, params.amountIn),
      amountOutWei: parseAssetAmount(params.assetOut, params.amountOut),
      assetIn: params.assetIn,
      assetOut: params.assetOut,
      slippage: params.slippage ?? this.defaultSlippage,
      deadline:
        params.deadline ??
        Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_OFFSET,
      // Send output tokens to specified recipient, or back to the initiating wallet
      recipient: params.recipient ?? params.walletAddress,
      walletAddress: params.walletAddress,
      chainId: params.chainId,
    }
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

  protected abstract _execute(
    params: ResolvedSwapParams,
  ): Promise<SwapTransaction>

  protected abstract _getPrice(params: SwapPriceParams): Promise<SwapPrice>

  protected abstract _getQuote(params: SwapQuoteParams): Promise<SwapQuote>

  protected abstract _executeFromQuote(
    quote: SwapQuote,
  ): Promise<SwapTransaction>

  protected abstract _getMarket(
    params: GetSwapMarketParams,
  ): Promise<SwapMarket>

  protected abstract _getMarkets(
    params: GetSwapMarketsParams,
  ): Promise<SwapMarket[]>
}

import type { Address } from 'viem'

import {
  findMarketInAllowlist,
  validateMarketAsset,
} from '@/actions/lend/utils/markets.js'
import { BaseActionProvider } from '@/actions/shared/BaseActionProvider.js'
import { filterMatchingConfigs } from '@/actions/shared/marketConfigs.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  AssetMetadataRequiredError,
  InvalidParamsError,
  MarketIdRequiredError,
  MarketNotAllowedError,
} from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  ApprovalMode,
  LendProviderConfig,
  LendSettings,
} from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type {
  ClosePositionParams,
  GetLendMarketParams,
  GetLendMarketsParams,
  GetMarketBalanceParams,
  GetPositionsParams,
  LendClosePositionParams,
  LendMarket,
  LendMarketConfig,
  LendMarketId,
  LendMarketPosition,
  LendOpenPosition,
  LendOpenPositionInternalParams,
  LendOpenPositionParams,
  LendTransaction,
  TransactionData,
} from '@/types/lend/index.js'
import {
  buildErc20ApprovalTx,
  resolveErc20ApprovalAmount,
} from '@/utils/approve.js'
import { isNativeAsset, parseAssetAmount } from '@/utils/assets.js'
import { validateChainIds, validateWalletAddress } from '@/utils/validation.js'

/** Inputs for the base class's ERC-20 lend approval helper. */
interface BuildLendApprovalParams {
  position: LendOpenPosition
  approvalMode: ApprovalMode
  amountWei: bigint
}

/**
 * Lending provider abstract class
 * @description Base class for lending provider implementations
 */
export abstract class LendProvider<
  TConfig extends LendProviderConfig = LendProviderConfig,
> extends BaseActionProvider<TConfig, LendSettings> {
  /**
   * Create a new lending provider
   * @param config - Provider-specific lending configuration
   * @param chainManager - Chain manager for blockchain interactions
   * @param settings - Shared lend settings applied across all providers
   */
  protected constructor(
    config: TConfig,
    chainManager: ChainManager,
    settings?: LendSettings,
  ) {
    super(config, chainManager, settings)
  }

  /**
   * Open a lending position
   * @param amount - Amount to lend (human-readable number)
   * @param asset - Asset to lend
   * @param marketId - Market identifier containing address and chainId
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   */
  async openPosition(params: LendOpenPositionParams): Promise<LendTransaction> {
    validateWalletAddress(params.walletAddress)

    this.validateMarketAllowed(params.marketId)

    // Convert human-readable amount to wei using the asset's decimals
    const amountWei = parseAssetAmount(params.asset, params.amount)

    const position = await this._openPosition({
      ...params,
      amountWei,
      walletAddress: params.walletAddress,
    })

    // Native deposits send ETH inline as msg.value; no approval is needed.
    // ERC-20 deposits resolve approval mode and build an approve(spender, amount) tx.
    const approval = isNativeAsset(params.asset)
      ? undefined
      : this.buildLendApproval({
          position,
          approvalMode: this.resolveApprovalMode(params.approvalMode),
          amountWei,
        })

    return {
      amount: amountWei,
      assetAddress: position.assetAddress,
      marketId: params.marketId.address,
      apy: position.apy,
      transactionData: {
        ...(approval ? { approval } : {}),
        position: position.transaction,
      },
    }
  }

  /**
   * Get detailed market information.
   * @description Rejects the market when it is blocklisted or missing from a
   * configured allowlist, before the provider reads it.
   * @param params - Market address and chain id
   * @returns Promise resolving to market information
   * @throws ChainNotSupportedError when the market chain is not configured
   * @throws MarketNotAllowedError when the market is blocklisted or absent
   * from a configured allowlist
   */
  async getMarket(params: GetLendMarketParams): Promise<LendMarket> {
    const marketId: LendMarketId = {
      address: params.address,
      chainId: params.chainId,
    }

    this.validateMarketAllowed(marketId)
    return this._getMarket(marketId)
  }

  /**
   * Get list of available lending markets.
   * @description Omits blocklisted markets. When an allowlist is configured,
   * markets outside it are omitted too, including caller-supplied `markets`.
   * @param params - Optional filtering parameters
   * @returns Promise resolving to markets that pass the provider lists
   * @throws ChainNotSupportedError when `params.chainId` is not configured
   */
  async getMarkets(params: GetLendMarketsParams = {}): Promise<LendMarket[]> {
    if (params.chainId !== undefined) this.assertChainSupported(params.chainId)

    const markets = await this._getMarkets({
      asset: params.asset,
      chainId: params.chainId,
      markets: this.selectMarketConfigs(params),
    })
    return markets.filter((market) =>
      this.isMarketConfigAllowed(market.marketId),
    )
  }

  /**
   * Get position information for a wallet
   * @param walletAddress - User wallet address to check position for
   * @param marketId - Market identifier (required)
   * @param asset - Asset filter (not yet supported)
   * @returns Promise resolving to position information
   */
  async getPosition(
    walletAddress: Address,
    marketId?: LendMarketId,
    asset?: Asset,
  ): Promise<LendMarketPosition> {
    // For now, require marketId (asset-only and empty params not yet supported)
    if (!marketId) {
      throw new MarketIdRequiredError(
        'Querying all positions or by asset is not yet supported.',
      )
    }

    if (asset) {
      throw new MarketIdRequiredError(
        'Filtering by asset is not yet supported. Please provide only marketId.',
      )
    }

    this.validateMarketAllowed(marketId)

    return this._getPosition({ marketId, walletAddress })
  }

  /**
   * @description Gets wallet positions across this provider's configured markets.
   * @param params - Wallet address and optional chain filters
   * @returns Promise resolving to the positions that resolved successfully
   * @throws AddressRequiredError if `walletAddress` is missing
   * @throws InvalidParamsError if both chain filters are set or `chainIds` is empty
   * @throws ChainNotSupportedError if a requested chain is not configured
   */
  async getPositions(
    params: GetPositionsParams = {},
  ): Promise<LendMarketPosition[]> {
    const { walletAddress } = params
    validateWalletAddress(walletAddress)
    const chainIds = this.resolvePositionChainIds(params)
    const markets = this.filterMarketConfigs().filter((market) =>
      chainIds.includes(market.chainId),
    )

    const settled = await Promise.allSettled(
      markets.map((market) =>
        this.getPosition(walletAddress, {
          address: market.address,
          chainId: market.chainId,
        }),
      ),
    )

    return settled
      .filter(
        (result): result is PromiseFulfilledResult<LendMarketPosition> =>
          result.status === 'fulfilled',
      )
      .map((result) => result.value)
  }

  /**
   * Close a lending position (withdraw assets from a market)
   * @param amount - Amount to withdraw (human-readable number)
   * @param asset - Asset to withdraw (optional, validated against marketId)
   * @param marketId - Market identifier containing address and chainId
   * @param walletAddress - Wallet address for receiving assets and as owner
   * @param options - Optional withdrawal configuration
   * @returns Promise resolving to withdrawal transaction details
   */
  async closePosition(params: ClosePositionParams): Promise<LendTransaction> {
    validateWalletAddress(params.walletAddress)

    this.validateMarketAllowed(params.marketId)

    const market = await this.getMarket({
      address: params.marketId.address,
      chainId: params.marketId.chainId,
    })

    if (params.asset) {
      validateMarketAsset(market, params.asset)
    }

    const assetMetadata = params.asset?.metadata
    if (!assetMetadata) {
      throw new AssetMetadataRequiredError('decimal conversion')
    }

    // Convert human-readable amount to wei using the asset's decimals
    const amountWei = parseAssetAmount(
      params.asset ?? market.asset,
      params.amount,
    )

    return this._closePosition({
      asset: params.asset,
      amount: amountWei,
      marketId: params.marketId,
      walletAddress: params.walletAddress,
      options: params.options,
    })
  }

  /**
   * Validate that a market passes chain, blocklist, and allowlist checks.
   * @description Blocklist matches are rejected before the allowlist is
   * consulted. An empty or omitted list does not restrict that side.
   * @param marketId - Market identifier containing address and chainId
   * @throws ChainNotSupportedError when the market chain is not configured
   * @throws MarketNotAllowedError when the market is blocklisted or absent
   * from a configured allowlist
   */
  protected validateMarketAllowed(marketId: LendMarketId): void {
    this.assertChainSupported(marketId.chainId)
    this.assertMarketListsAllow(marketId)
  }

  /**
   * Build an ERC20 approval transaction
   * @param tokenAddress - Address of the token to approve
   * @param spender - Address to approve spending for
   * @param amount - Amount to approve
   * @returns Transaction data for the approval
   */
  protected buildApprovalTx(
    tokenAddress: Address,
    spender: Address,
    amount: bigint,
  ): TransactionData {
    return buildErc20ApprovalTx({ assetAddress: tokenAddress, spender, amount })
  }

  private resolvePositionChainIds(
    params: GetPositionsParams,
  ): SupportedChainId[] {
    if (params.chainId !== undefined && params.chainIds !== undefined) {
      throw new InvalidParamsError({
        param: 'chainId/chainIds',
        expected: 'only one chain filter',
        received: 'both filters',
      })
    }
    const configuredChainIds = this.chainManager.getSupportedChains()
    const chainIds =
      params.chainIds ??
      (params.chainId === undefined ? configuredChainIds : [params.chainId])
    validateChainIds(chainIds, configuredChainIds)
    return [...new Set(chainIds)]
  }

  /**
   * Build the approval transaction for an ERC-20 lend deposit. Caller is
   * expected to skip this for native deposits.
   * @throws if the provider's `_openPosition` result is missing `spender`
   */
  private buildLendApproval(params: BuildLendApprovalParams): TransactionData {
    const { position, approvalMode, amountWei } = params
    if (!position.spender) {
      throw new Error(
        `LendOpenPosition.spender is required for ERC-20 deposits (assetAddress: ${position.assetAddress})`,
      )
    }
    return buildErc20ApprovalTx({
      assetAddress: position.assetAddress,
      spender: position.spender,
      amount: resolveErc20ApprovalAmount(approvalMode, amountWei),
    })
  }

  /**
   * Resolve the market configs `getMarkets` should read.
   * @description An empty caller-supplied list falls back to the configured
   * allowlist. Non-empty caller lists are kept only when they pass the
   * blocklist and allowlist.
   * @param params - Optional chain, asset, and market filters
   * @returns Market configs to pass to the provider hook
   */
  private selectMarketConfigs(
    params: GetLendMarketsParams,
  ): LendMarketConfig[] {
    if (!params.markets?.length) {
      return this.filterMarketConfigs(params.chainId, params.asset)
    }
    return params.markets.filter((market) => this.isMarketConfigAllowed(market))
  }

  /**
   * Report whether a market passes the configured blocklist and allowlist.
   * @param marketId - Market identifier containing address and chainId
   * @returns `false` when the market is blocked or not allowlisted
   */
  private isMarketConfigAllowed(marketId: LendMarketId): boolean {
    try {
      this.assertMarketListsAllow(marketId)
      return true
    } catch (error) {
      if (error instanceof MarketNotAllowedError) return false
      throw error
    }
  }

  /**
   * Reject a market that is blocklisted or missing from a configured allowlist.
   * @description Blocklist is checked first so a market present on both lists
   * fails as blocked. Chain support is enforced by the caller.
   * @param marketId - Market identifier containing address and chainId
   * @throws MarketNotAllowedError when the market is blocklisted or absent
   * from a configured allowlist
   */
  private assertMarketListsAllow(marketId: LendMarketId): void {
    const { marketBlocklist, marketAllowlist } = this._config

    if (
      marketBlocklist?.length &&
      findMarketInAllowlist(marketBlocklist, marketId)
    ) {
      throw new MarketNotAllowedError({
        address: marketId.address,
        chainId: marketId.chainId,
        reason: 'Market is blocked',
      })
    }

    if (
      marketAllowlist?.length &&
      !findMarketInAllowlist(marketAllowlist, marketId)
    ) {
      throw new MarketNotAllowedError({
        address: marketId.address,
        chainId: marketId.chainId,
        reason: 'Market is not in the allowlist',
      })
    }
  }

  /**
   * Helper method to filter market configurations.
   * @description Starts from the allowlist, then applies chain, asset, and
   * blocklist filters. An empty allowlist yields no configs.
   * @param chainId - Chain ID to filter by
   * @param asset - Asset to filter by
   * @returns Filtered market configurations
   */
  private filterMarketConfigs(
    chainId?: SupportedChainId,
    asset?: Asset,
  ): LendMarketConfig[] {
    return filterMatchingConfigs(this._config.marketAllowlist, [
      chainId === undefined
        ? undefined
        : (market: LendMarketConfig) => market.chainId === chainId,
      asset === undefined
        ? undefined
        : (market: LendMarketConfig) => market.asset === asset,
      (market: LendMarketConfig) => this.isMarketConfigAllowed(market),
    ])
  }

  /**
   * Describe a deposit for opening a lending position. Providers describe
   * **what** needs to happen (the spender that needs allowance + the deposit
   * calldata + APY snapshot); the base class owns **how** the approval is
   * built (amount sized via `approvalMode`, native deposits skipped, etc.).
   *
   * Return `spender: undefined` for native-asset deposits where value is sent
   * inline as `msg.value` and no ERC-20 approval is required.
   * @description Must be implemented by providers
   */
  protected abstract _openPosition(
    params: LendOpenPositionInternalParams,
  ): Promise<LendOpenPosition>

  /**
   * Provider implementation of getMarket method
   * @description Must be implemented by providers
   */
  protected abstract _getMarket(marketId: LendMarketId): Promise<LendMarket>

  /**
   * Provider implementation of getMarkets method
   * @description Must be implemented by providers
   */
  protected abstract _getMarkets(
    params: GetLendMarketsParams,
  ): Promise<LendMarket[]>

  /**
   * Provider implementation of getPosition method
   * @description Must be implemented by providers
   */
  protected abstract _getPosition(
    params: GetMarketBalanceParams,
  ): Promise<LendMarketPosition>

  /**
   * Provider implementation of closePosition method
   * @description Must be implemented by providers
   */
  protected abstract _closePosition(
    params: LendClosePositionParams,
  ): Promise<LendTransaction>
}

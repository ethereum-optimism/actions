import type { Address } from 'viem'

import {
  lendMarketIdMatches,
  validateMarketAsset,
} from '@/actions/lend/utils/markets.js'
import { BaseActionProvider } from '@/actions/shared/BaseActionProvider.js'
import {
  filterMatchingConfigs,
  findMatchingConfig,
} from '@/actions/shared/marketConfigs.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  AssetMetadataRequiredError,
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
import { validateWalletAddress } from '@/utils/validation.js'

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
   * Get detailed market information
   * @param address - Market contract address
   * @param chainId - Chain ID where the market exists
   * @returns Promise resolving to market information
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
   * Get list of available lending markets
   * @param params - Optional filtering parameters
   * @returns Promise resolving to array of market information
   */
  async getMarkets(params: GetLendMarketsParams = {}): Promise<LendMarket[]> {
    if (params.chainId !== undefined) this.assertChainSupported(params.chainId)

    const filteredMarkets = this.filterMarketConfigs(
      params.chainId,
      params.asset,
    )

    return this._getMarkets({
      asset: params.asset,
      chainId: params.chainId,
      markets: params.markets || filteredMarkets,
    })
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
   * Get this provider's positions for a wallet across its configured markets
   * @description Walks the provider's market allowlist (optionally filtered by
   * `chainId`) and fetches each position concurrently. Per-market failures are
   * isolated via `Promise.allSettled` and dropped from the result so a single
   * bad RPC can't poison the batch. Returns every queried market's position
   * (including zero balances); zero-balance filtering is applied by the
   * aggregating namespace.
   * @param walletAddress - User wallet address to check positions for
   * @param params - Optional chain filter
   * @returns Promise resolving to the positions that resolved successfully
   * @throws AddressRequiredError if `walletAddress` is missing
   */
  async getPositions(
    walletAddress: Address,
    params: GetPositionsParams = {},
  ): Promise<LendMarketPosition[]> {
    if (!walletAddress) {
      throw new AddressRequiredError('walletAddress')
    }

    if (params.chainId !== undefined) {
      validateChainSupported(params.chainId, this.supportedChainIds())
    }

    const markets = this.filterMarketConfigs(params.chainId)

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
   * Validate that a market is in the config's market allowlist
   * @param marketId - Market identifier containing address and chainId
   * @throws Error if market allowlist is configured but market is not in it
   */
  protected validateMarketAllowed(marketId: LendMarketId): void {
    this.assertChainSupported(marketId.chainId)

    if (
      !this._config.marketAllowlist ||
      this._config.marketAllowlist.length === 0
    ) {
      return
    }

    const foundMarket = findMatchingConfig({
      configs: this._config.marketAllowlist,
      target: marketId,
      matches: lendMarketIdMatches,
    })

    if (!foundMarket) {
      throw new MarketNotAllowedError({
        address: marketId.address,
        chainId: marketId.chainId,
        reason: 'Market is not in the market allowlist',
      })
    }
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
   * Helper method to filter market configurations
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

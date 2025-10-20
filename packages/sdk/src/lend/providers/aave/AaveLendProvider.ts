import { encodeFunctionData, erc20Abi, formatUnits, parseAbi } from 'viem'

import { getPoolAddress, getSupportedChainIds } from './addresses.js'
import { getReserve, getReserves } from './sdk.js'
import { LendProvider } from '@/lend/core/LendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  AaveLendConfig,
  GetLendMarketsParams,
  GetMarketBalanceParams,
  LendClosePositionParams,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendOpenPositionInternalParams,
  LendTransaction,
} from '@/types/lend/index.js'
import { getAssetAddress } from '@/utils/assets.js'

/**
 * Aave Pool ABI - only the functions we need
 */
const POOL_ABI = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
])

/**
 * Supported chain IDs for Aave lending
 * @description Array of chain IDs where Aave V3 is available on Optimism Superchain
 */
export const SUPPORTED_CHAIN_IDS = getSupportedChainIds() as readonly number[]

/**
 * Aave lending provider implementation
 * @description Lending provider implementation using Aave V3 protocol
 */
export class AaveLendProvider extends LendProvider<AaveLendConfig> {
  protected readonly SUPPORTED_CHAIN_IDS = SUPPORTED_CHAIN_IDS

  private chainManager: ChainManager

  /**
   * Create a new Aave lending provider
   * @param config - Aave lending configuration
   * @param chainManager - Chain manager for blockchain interactions
   */
  constructor(config: AaveLendConfig, chainManager: ChainManager) {
    super(config)
    this.chainManager = chainManager
  }

  /**
   * Open a lending position in an Aave market
   * @description Opens a lending position by supplying assets to an Aave reserve
   * @param params - Position opening parameters
   * @returns Promise resolving to lending transaction details
   */
  protected async _openPosition(
    params: LendOpenPositionInternalParams,
  ): Promise<LendTransaction> {
    try {
      // Get Pool address for this chain
      const poolAddress = getPoolAddress(params.marketId.chainId)
      if (!poolAddress) {
        throw new Error(
          `Aave V3 not deployed on chain ${params.marketId.chainId}`,
        )
      }

      // Get asset address for the chain
      const assetAddress = params.asset.address[params.marketId.chainId]
      if (!assetAddress) {
        throw new Error(
          `Asset not supported on chain ${params.marketId.chainId}`,
        )
      }

      // Get market information for APY
      const marketInfo = await this.getMarket({
        address: params.marketId.address,
        chainId: params.marketId.chainId,
      })

      // Generate approval transaction
      const approvalCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [poolAddress, params.amountWei],
      })

      // Generate supply transaction
      const supplyCallData = encodeFunctionData({
        abi: POOL_ABI,
        functionName: 'supply',
        args: [
          assetAddress, // asset
          params.amountWei, // amount
          params.walletAddress, // onBehalfOf
          0, // referralCode
        ],
      })

      return {
        amount: params.amountWei,
        asset: assetAddress,
        marketId: params.marketId.address,
        apy: marketInfo.apy.total,
        transactionData: {
          approval: {
            to: assetAddress,
            data: approvalCallData,
            value: 0n,
          },
          openPosition: {
            to: poolAddress,
            data: supplyCallData,
            value: 0n,
          },
        },
        slippage: params.options?.slippage || this._config.defaultSlippage,
      }
    } catch (error) {
      throw new Error(
        `Failed to open position with ${params.amountWei} of ${params.asset.metadata.symbol}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Close a position in an Aave market
   * @description Withdraws assets from an Aave reserve
   * @param params - Position closing operation parameters
   * @returns Promise resolving to withdrawal transaction details
   */
  protected async _closePosition(
    params: LendClosePositionParams,
  ): Promise<LendTransaction> {
    try {
      // Get Pool address for this chain
      const poolAddress = getPoolAddress(params.marketId.chainId)
      if (!poolAddress) {
        throw new Error(
          `Aave V3 not deployed on chain ${params.marketId.chainId}`,
        )
      }

      const marketInfo = await this.getMarket({
        address: params.marketId.address,
        chainId: params.marketId.chainId,
      })

      // Get asset address for the market's chain
      const assetAddress = getAssetAddress(
        marketInfo.asset,
        params.marketId.chainId,
      )

      // Generate withdraw transaction
      const withdrawCallData = encodeFunctionData({
        abi: POOL_ABI,
        functionName: 'withdraw',
        args: [
          assetAddress, // asset
          params.amount, // amount
          params.walletAddress, // to
        ],
      })

      return {
        amount: params.amount,
        asset: assetAddress,
        marketId: params.marketId.address,
        apy: marketInfo.apy.total,
        transactionData: {
          closePosition: {
            to: poolAddress,
            data: withdrawCallData,
            value: 0n,
          },
        },
        slippage: params.options?.slippage || this._config.defaultSlippage,
      }
    } catch (error) {
      throw new Error(
        `Failed to close position: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Get detailed market information
   * @param marketId - Market identifier containing address and chainId
   * @returns Promise resolving to market information
   */
  protected async _getMarket(marketId: LendMarketId): Promise<LendMarket> {
    return getReserve({
      marketId,
      chainManager: this.chainManager,
      lendConfig: this._config,
    })
  }

  /**
   * Get list of available lending markets
   * @param params - Filtering parameters
   * @returns Promise resolving to array of market information
   */
  protected async _getMarkets(
    params: GetLendMarketsParams,
  ): Promise<LendMarket[]> {
    const marketConfigs = params.markets || []

    return getReserves({
      chainManager: this.chainManager,
      lendConfig: this._config,
      markets: marketConfigs,
    })
  }

  /**
   * Get position for a specific wallet address
   * @param params - Parameters for fetching position
   * @returns Promise resolving to position information
   */
  protected async _getPosition(
    params: GetMarketBalanceParams,
  ): Promise<LendMarketPosition> {
    try {
      const publicClient = this.chainManager.getPublicClient(
        params.marketId.chainId,
      )

      // Get market info to find the aToken address
      const market = await this._getMarket(params.marketId)
      const assetAddress = getAssetAddress(market.asset, params.marketId.chainId)

      // In Aave, aTokens have the same address pattern
      // We need to get the aToken address from the reserve data
      // For now, we'll read the aToken balance directly
      // The aToken address would be in the reserve configuration

      // Get user's aToken balance
      // Note: In production, we should fetch the aToken address from reserve data
      // For now, we'll use a simplified approach and read the balance directly

      // TODO: Fetch aToken address from Pool.getReserveData(asset)
      // For now, return zero balance as placeholder
      const balance = 0n
      const balanceFormatted = formatUnits(balance, market.asset.metadata.decimals)

      return {
        balance,
        balanceFormatted,
        shares: balance, // In Aave, aTokens are 1:1 with underlying
        sharesFormatted: balanceFormatted,
        marketId: params.marketId,
      }
    } catch (error) {
      throw new Error(
        `Failed to get market balance for ${params.walletAddress} in market ${params.marketId.address}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }
}

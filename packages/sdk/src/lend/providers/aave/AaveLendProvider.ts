import type { Address } from 'viem'
import { encodeFunctionData, erc20Abi, formatUnits } from 'viem'

import { WETH } from '@/constants/assets.js'
import { LendProvider } from '@/lend/core/LendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type {
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

import { POOL_ABI, WETH_GATEWAY_ABI } from './abis/pool.js'
import {
  getPoolAddress,
  getSupportedChainIds,
  getWETHGatewayAddress,
} from './addresses.js'
import { getATokenAddress, getReserve, getReserves } from './sdk.js'

/**
 * Supported chain IDs for Aave lending
 * @description Array of chain IDs where Aave V3 is available on Optimism Superchain
 */
export const SUPPORTED_CHAIN_IDS = getSupportedChainIds() as readonly number[]

/**
 * Aave lending provider implementation
 * @description Lending provider implementation using Aave V3 protocol
 */
export class AaveLendProvider extends LendProvider<LendProviderConfig> {
  protected readonly SUPPORTED_CHAIN_IDS = SUPPORTED_CHAIN_IDS

  /**
   * Create a new Aave lending provider
   * @param config - Aave lending configuration
   * @param chainManager - Chain manager for blockchain interactions
   */
  constructor(config: LendProviderConfig, chainManager: ChainManager) {
    super(config, chainManager)
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

      // Get market information for APY
      const marketInfo = await this.getMarket({
        address: params.marketId.address,
        chainId: params.marketId.chainId,
      })

      // Check if this is a native ETH market
      if (this.isNativeAsset(params.asset)) {
        return this._openNativePosition(params, poolAddress, marketInfo)
      }

      // Standard ERC-20 flow
      return this._openERC20Position(params, poolAddress, marketInfo)
    } catch {
      throw new Error(
        `Failed to open position with ${params.amountWei} of ${params.asset.metadata.symbol}`,
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

      // Check if this is a native ETH market
      if (this.isNativeAsset(marketInfo.asset)) {
        return this._closeNativePosition(params, poolAddress, marketInfo)
      }

      // Standard ERC-20 flow
      return this._closeERC20Position(params, poolAddress, marketInfo)
    } catch {
      throw new Error('Failed to close position')
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
      const market = await this._getMarket(params.marketId)
      const poolAddress = getPoolAddress(params.marketId.chainId)

      if (!poolAddress) {
        throw new Error(
          `Aave V3 not deployed on chain ${params.marketId.chainId}`,
        )
      }

      // Get the aToken address from Pool.getReserveData
      // For native assets, use WETH address since Aave uses WETH internally
      const assetAddress = this.isNativeAsset(market.asset)
        ? getAssetAddress(WETH, params.marketId.chainId)
        : getAssetAddress(market.asset, params.marketId.chainId)

      const aTokenAddress = await getATokenAddress({
        underlyingAsset: assetAddress,
        chainId: params.marketId.chainId,
        chainManager: this.chainManager,
      })

      const balance = await publicClient.readContract({
        address: aTokenAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [params.walletAddress],
      })

      const balanceFormatted = formatUnits(
        balance,
        market.asset.metadata.decimals,
      )

      return {
        balance,
        balanceFormatted,
        shares: balance, // In Aave, aTokens are 1:1 with underlying
        sharesFormatted: balanceFormatted,
        marketId: params.marketId,
      }
    } catch {
      throw new Error(
        `Failed to get market balance for ${params.walletAddress} in market ${params.marketId.address}`,
      )
    }
  }

  /**
   * Check if asset is native ETH
   * @param asset - Asset to check
   * @returns true if asset is native ETH
   */
  private isNativeAsset(asset: Asset): boolean {
    return asset.type === 'native'
  }

  /**
   * Open position for native ETH using WETHGateway
   * @description Deposits native ETH via WETHGateway which wraps and deposits in one tx
   */
  private async _openNativePosition(
    params: LendOpenPositionInternalParams,
    poolAddress: Address,
    marketInfo: LendMarket,
  ): Promise<LendTransaction> {
    const gatewayAddress = getWETHGatewayAddress(params.marketId.chainId)
    if (!gatewayAddress) {
      throw new Error(
        `WETHGateway not available on chain ${params.marketId.chainId}`,
      )
    }

    // Generate depositETH transaction
    const depositCallData = encodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      functionName: 'depositETH',
      args: [
        poolAddress, // pool address
        params.walletAddress, // onBehalfOf (receives aWETH)
        0, // referralCode (0 = no referral)
      ],
    })

    const wethAddress = getAssetAddress(WETH, params.marketId.chainId)

    return {
      amount: params.amountWei,
      asset: wethAddress,
      marketId: params.marketId.address,
      apy: marketInfo.apy.total,
      transactionData: {
        position: {
          to: gatewayAddress,
          data: depositCallData,
          value: params.amountWei, // Send ETH as msg.value
        },
      },
    }
  }

  /**
   * Open position for standard ERC-20 tokens
   * @description Standard approve + supply flow for non-WETH assets
   */
  private async _openERC20Position(
    params: LendOpenPositionInternalParams,
    poolAddress: Address,
    marketInfo: LendMarket,
  ): Promise<LendTransaction> {
    // Get asset address for the chain (throws for native assets)
    const assetAddress = getAssetAddress(params.asset, params.marketId.chainId)

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
        approval: this.buildApprovalTx(
          assetAddress,
          poolAddress,
          params.amountWei,
        ),
        position: {
          to: poolAddress,
          data: supplyCallData,
          value: 0n,
        },
      },
    }
  }

  /**
   * Close position for native ETH using WETHGateway
   * @description Withdraws aWETH, unwraps to ETH, and sends to user
   */
  private async _closeNativePosition(
    params: LendClosePositionParams,
    poolAddress: Address,
    marketInfo: LendMarket,
  ): Promise<LendTransaction> {
    const gatewayAddress = getWETHGatewayAddress(params.marketId.chainId)
    if (!gatewayAddress) {
      throw new Error(
        `WETHGateway not available on chain ${params.marketId.chainId}`,
      )
    }

    const wethAddress = getAssetAddress(WETH, params.marketId.chainId)

    // Get the aToken address for the underlying WETH asset
    const aWETHAddress = await getATokenAddress({
      underlyingAsset: wethAddress,
      chainId: params.marketId.chainId,
      chainManager: this.chainManager,
    })

    // Call withdrawETH on gateway
    const withdrawCallData = encodeFunctionData({
      abi: WETH_GATEWAY_ABI,
      functionName: 'withdrawETH',
      args: [
        poolAddress, // pool
        params.amount, // amount
        params.walletAddress, // to (receives native ETH)
      ],
    })

    return {
      amount: params.amount,
      asset: wethAddress,
      marketId: params.marketId.address,
      apy: marketInfo.apy.total,
      transactionData: {
        approval: this.buildApprovalTx(
          aWETHAddress,
          gatewayAddress,
          params.amount,
        ),
        position: {
          to: gatewayAddress,
          data: withdrawCallData,
          value: 0n,
        },
      },
    }
  }

  /**
   * Close position for standard ERC-20 tokens
   */
  private async _closeERC20Position(
    params: LendClosePositionParams,
    poolAddress: Address,
    marketInfo: LendMarket,
  ): Promise<LendTransaction> {
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
        position: {
          to: poolAddress,
          data: withdrawCallData,
          value: 0n,
        },
      },
    }
  }
}

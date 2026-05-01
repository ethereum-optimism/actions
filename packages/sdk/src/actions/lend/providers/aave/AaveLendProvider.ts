import type { Address } from 'viem'
import { encodeFunctionData, erc20Abi, formatUnits } from 'viem'

import { LendProvider } from '@/actions/lend/core/LendProvider.js'
import { WETH } from '@/constants/assets.js'
import { ChainNotSupportedError } from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig, LendSettings } from '@/types/actions.js'
import type {
  GetLendMarketsParams,
  GetMarketBalanceParams,
  LendClosePositionParams,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendOpenPosition,
  LendOpenPositionInternalParams,
  LendTransaction,
} from '@/types/lend/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'

import { POOL_ABI, WETH_GATEWAY_ABI } from './abis/pool.js'
import {
  getPoolAddress,
  getSupportedChainIds,
  getWETHGatewayAddress,
} from './addresses.js'
import { getATokenAddress, getReserve, getReserves } from './sdk.js'

/**
 * Aave lending provider implementation
 * @description Lending provider implementation using Aave V3 protocol
 */
export class AaveLendProvider extends LendProvider<LendProviderConfig> {
  constructor(
    config: LendProviderConfig,
    chainManager: ChainManager,
    settings?: LendSettings,
  ) {
    super(config, chainManager, settings)
  }

  protocolSupportedChainIds(): number[] {
    return getSupportedChainIds()
  }

  /**
   * Describe an Aave deposit. The base class wraps this into a
   * `LendTransaction` with the appropriate ERC-20 approval based on
   * `params.approvalMode`. Native-ETH paths return `spender: undefined` since
   * deposits via the WETHGateway send value as `msg.value` rather than via
   * `transferFrom`.
   * @param params - Position opening parameters (amount in wei, walletAddress, approvalMode)
   * @returns Spender + deposit calldata + APY snapshot
   */
  protected async _openPosition(
    params: LendOpenPositionInternalParams,
  ): Promise<LendOpenPosition> {
    try {
      // Get Pool address for this chain
      const poolAddress = getPoolAddress(params.marketId.chainId)
      if (!poolAddress) {
        throw new ChainNotSupportedError({
          chainId: params.marketId.chainId,
          supportedChainIds: this.supportedChainIds(),
        })
      }

      // Get market information for APY
      const marketInfo = await this.getMarket({
        address: params.marketId.address,
        chainId: params.marketId.chainId,
      })

      if (isNativeAsset(params.asset)) {
        return this._buildETHOpenPosition(params, poolAddress, marketInfo)
      }
      return this._buildERC20OpenPosition(params, poolAddress, marketInfo)
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
        throw new ChainNotSupportedError({
          chainId: params.marketId.chainId,
          supportedChainIds: this.supportedChainIds(),
        })
      }

      const marketInfo = await this.getMarket({
        address: params.marketId.address,
        chainId: params.marketId.chainId,
      })

      // Check if this is a native ETH market
      if (isNativeAsset(marketInfo.asset)) {
        return this._closeETHPosition(params, poolAddress, marketInfo)
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
        throw new ChainNotSupportedError({
          chainId: params.marketId.chainId,
          supportedChainIds: this.supportedChainIds(),
        })
      }

      // Get the aToken address from Pool.getReserveData
      // For native assets, use WETH address since Aave uses WETH internally
      const assetAddress = isNativeAsset(market.asset)
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
   * Describe a native-ETH deposit via Aave's WETHGateway. ETH is sent as
   * `msg.value` and wrapped to aWETH inline — no ERC-20 approval needed.
   */
  private async _buildETHOpenPosition(
    params: LendOpenPositionInternalParams,
    poolAddress: Address,
    marketInfo: LendMarket,
  ): Promise<LendOpenPosition> {
    const gatewayAddress = getWETHGatewayAddress(params.marketId.chainId)
    if (!gatewayAddress) {
      throw new ChainNotSupportedError({
        chainId: params.marketId.chainId,
        supportedChainIds: this.supportedChainIds(),
      })
    }

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
      assetAddress: wethAddress,
      transaction: {
        to: gatewayAddress,
        data: depositCallData,
        value: params.amountWei, // Send ETH as msg.value
      },
      apy: marketInfo.apy.total,
    }
  }

  /**
   * Describe a standard ERC-20 deposit. The base class builds the approval to
   * `poolAddress` based on `params.approvalMode`.
   */
  private async _buildERC20OpenPosition(
    params: LendOpenPositionInternalParams,
    poolAddress: Address,
    marketInfo: LendMarket,
  ): Promise<LendOpenPosition> {
    // Get asset address for the chain (throws for native assets)
    const assetAddress = getAssetAddress(params.asset, params.marketId.chainId)

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
      spender: poolAddress,
      assetAddress,
      transaction: {
        to: poolAddress,
        data: supplyCallData,
        value: 0n,
      },
      apy: marketInfo.apy.total,
    }
  }

  /**
   * Close position for native ETH using WETHGateway
   * @description Withdraws aWETH, unwraps to ETH, and sends to user
   */
  private async _closeETHPosition(
    params: LendClosePositionParams,
    poolAddress: Address,
    marketInfo: LendMarket,
  ): Promise<LendTransaction> {
    const gatewayAddress = getWETHGatewayAddress(params.marketId.chainId)
    if (!gatewayAddress) {
      throw new ChainNotSupportedError({
        chainId: params.marketId.chainId,
        supportedChainIds: this.supportedChainIds(),
      })
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
      assetAddress: wethAddress,
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
      assetAddress,
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

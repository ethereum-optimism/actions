import type { Address } from 'viem'
import { encodeFunctionData, erc20Abi, formatUnits, parseAbi } from 'viem'

import { LendProvider } from '@/lend/core/LendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
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

import {
  getPoolAddress,
  getSupportedChainIds,
  getWETHGatewayAddress,
} from './addresses.js'
import { getReserve, getReserves } from './sdk.js'

/**
 * WETH predeploy address on OP Stack chains
 * @description WETH is deployed at the same address on all OP Stack chains (Optimism, Base, etc.)
 */
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'

/**
 * Aave Pool ABI - only the functions we need
 */
const POOL_ABI = parseAbi([
  'function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)',
  'function withdraw(address asset, uint256 amount, address to) returns (uint256)',
])

/**
 * Aave WETHGateway ABI - for native ETH deposits/withdrawals
 */
const WETH_GATEWAY_ABI = parseAbi([
  'function depositETH(address pool, address onBehalfOf, uint16 referralCode) payable',
  'function withdrawETH(address pool, uint256 amount, address to)',
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

      // Check if this is a WETH market
      if (this.isWETHMarket(params.marketId)) {
        return this._openWETHPosition(params, poolAddress, marketInfo)
      }

      // Standard ERC-20 flow
      return this._openERC20Position(params, poolAddress, marketInfo)
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

      // Check if this is a WETH market
      if (this.isWETHMarket(params.marketId)) {
        return this._closeWETHPosition(params, poolAddress, marketInfo)
      }

      // Standard ERC-20 flow
      return this._closeERC20Position(params, poolAddress, marketInfo)
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
      const market = await this._getMarket(params.marketId)
      const poolAddress = getPoolAddress(params.marketId.chainId)

      if (!poolAddress) {
        throw new Error(
          `Aave V3 not deployed on chain ${params.marketId.chainId}`,
        )
      }

      // Get the aToken address from Pool.getReserveData
      const assetAddress = getAssetAddress(
        market.asset,
        params.marketId.chainId,
      )

      const reserveData = (await publicClient.readContract({
        address: poolAddress,
        abi: parseAbi([
          'struct ReserveData { uint256 configuration; uint128 liquidityIndex; uint128 currentLiquidityRate; uint128 variableBorrowIndex; uint128 currentVariableBorrowRate; uint128 currentStableBorrowRate; uint40 lastUpdateTimestamp; uint16 id; address aTokenAddress; address stableDebtTokenAddress; address variableDebtTokenAddress; address interestRateStrategyAddress; uint128 accruedToTreasury; uint128 unbacked; uint128 isolationModeTotalDebt; }',
          'function getReserveData(address asset) view returns (ReserveData)',
        ]),
        functionName: 'getReserveData',
        args: [assetAddress],
      })) as {
        aTokenAddress: Address
      }

      const aTokenAddress = reserveData.aTokenAddress

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
    } catch (error) {
      throw new Error(
        `Failed to get market balance for ${params.walletAddress} in market ${params.marketId.address}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Check if market is a WETH market
   * @param marketId - Market identifier
   * @returns true if market is for WETH
   * @description WETH is a predeploy at the same address on all OP Stack chains
   */
  private isWETHMarket(marketId: LendMarketId): boolean {
    return marketId.address.toLowerCase() === WETH_ADDRESS.toLowerCase()
  }

  /**
   * Open position for WETH market using WETHGateway
   * @description Deposits native ETH via WETHGateway which wraps and deposits in one tx
   */
  private async _openWETHPosition(
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

    return {
      amount: params.amountWei,
      asset: WETH_ADDRESS,
      marketId: params.marketId.address,
      apy: marketInfo.apy.total,
      transactionData: {
        openPosition: {
          to: gatewayAddress,
          data: depositCallData,
          value: params.amountWei, // Send ETH as msg.value
        },
      },
      slippage: params.options?.slippage ?? 50,
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
    // Get asset address for the chain
    const assetAddress = params.asset.address[params.marketId.chainId]
    if (!assetAddress) {
      throw new Error(`Asset not supported on chain ${params.marketId.chainId}`)
    }

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
      slippage: params.options?.slippage ?? 50,
    }
  }

  /**
   * Close position for WETH market using WETHGateway
   * @description Withdraws aWETH, unwraps to ETH, and sends to user
   */
  private async _closeWETHPosition(
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

    // Get the aToken address for the underlying WETH asset
    // Note: params.marketId.address is the underlying WETH address, not the aToken
    const { getATokenAddress } = await import('./sdk.js')
    const aWETHAddress = await getATokenAddress({
      underlyingAsset: params.marketId.address,
      chainId: params.marketId.chainId,
      chainManager: this.chainManager,
    })

    // First: User must approve aWETH to WETHGateway
    const approvalCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [gatewayAddress, params.amount],
    })

    // Second: Call withdrawETH on gateway
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
      asset: WETH_ADDRESS,
      marketId: params.marketId.address,
      apy: marketInfo.apy.total,
      transactionData: {
        approval: {
          to: aWETHAddress,
          data: approvalCallData,
          value: 0n,
        },
        closePosition: {
          to: gatewayAddress,
          data: withdrawCallData,
          value: 0n,
        },
      },
      slippage: params.options?.slippage ?? 50,
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
        closePosition: {
          to: poolAddress,
          data: withdrawCallData,
          value: 0n,
        },
      },
      slippage: params.options?.slippage ?? 50,
    }
  }
}

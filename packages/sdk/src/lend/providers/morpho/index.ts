import { ChainId } from '@morpho-org/blue-sdk'
import { MetaMorphoAction } from '@morpho-org/blue-sdk-viem'
import { encodeFunctionData, erc20Abi, formatUnits } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'

import { SUPPORTED_CHAIN_IDS as VERBS_SUPPORTED_CHAIN_IDS } from '../../../constants/supportedChains.js'
import type {
  GetLendMarketsParams,
  GetMarketBalanceParams,
  LendClosePositionParams,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendOpenPositionInternalParams,
  LendTransaction,
  MorphoLendConfig,
} from '../../../types/lend.js'
import { LendProvider } from '../../provider.js'
import { getVault, getVaults } from './sdk.js'

/**
 * Supported chain IDs for Morpho lending
 * @description Array of chain IDs where Morpho is available
 */
export const SUPPORTED_CHAIN_IDS = [
  ...new Set([
    ...Object.values(ChainId).filter(
      (value): value is number => typeof value === 'number',
    ),
    ...VERBS_SUPPORTED_CHAIN_IDS,
  ]),
] as readonly number[]

/**
 * Morpho lending provider implementation
 * @description Lending provider implementation using Morpho protocol
 */
export class LendProviderMorpho extends LendProvider<MorphoLendConfig> {
  protected readonly SUPPORTED_CHAIN_IDS = SUPPORTED_CHAIN_IDS

  private chainManager: ChainManager

  /**
   * Create a new Morpho lending provider
   * @param config - Morpho lending configuration
   * @param chainManager - Chain manager for blockchain interactions
   */
  constructor(config: MorphoLendConfig, chainManager: ChainManager) {
    super(config)
    this.chainManager = chainManager
  }

  /**
   * Open a lending position in a Morpho market
   * @description Opens a lending position by supplying assets to a Morpho market
   * @param params - Position opening parameters
   * @returns Promise resolving to lending transaction details
   */
  protected async _openPosition(
    params: LendOpenPositionInternalParams,
  ): Promise<LendTransaction> {
    try {
      // Get asset address for the chain
      const assetAddress = params.asset.address[params.marketId.chainId]
      if (!assetAddress) {
        throw new Error(
          `Asset not supported on chain ${params.marketId.chainId}`,
        )
      }

      // Get vault information for APY
      const vaultInfo = await this.getMarket({
        address: params.marketId.address,
        chainId: params.marketId.chainId,
      })

      const depositCallData = MetaMorphoAction.deposit(
        params.amountWei,
        params.walletAddress,
      )

      const approvalCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [params.marketId.address, params.amountWei],
      })

      const currentTimestamp = Math.floor(Date.now() / 1000)

      return {
        amount: params.amountWei,
        asset: assetAddress,
        marketId: params.marketId.address,
        apy: vaultInfo.apy,
        timestamp: currentTimestamp,
        transactionData: {
          approval: {
            to: assetAddress,
            data: approvalCallData,
            value: 0n,
          },
          openPosition: {
            to: params.marketId.address,
            data: depositCallData,
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
   * Close a position in a Morpho market
   * @description Withdraws assets from a Morpho market
   * @param params - Position closing operation parameters
   * @returns Promise resolving to withdrawal transaction details
   */
  protected async _closePosition(
    params: LendClosePositionParams,
  ): Promise<LendTransaction> {
    try {
      const vaultInfo = await this.getMarket({
        address: params.marketId.address,
        chainId: params.marketId.chainId,
      })

      const assetAddress = vaultInfo.asset

      const withdrawCallData = MetaMorphoAction.withdraw(
        params.amount,
        params.walletAddress,
        params.walletAddress,
      )

      const currentTimestamp = Math.floor(Date.now() / 1000)

      return {
        amount: params.amount,
        asset: assetAddress,
        marketId: params.marketId.address,
        apy: vaultInfo.apy,
        timestamp: currentTimestamp,
        transactionData: {
          closePosition: {
            to: params.marketId.address,
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
    return getVault({
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
    // We will eventually fetch markets externally, filtered by Asset and chainId
    const _unused = { asset: params.asset, chainId: params.chainId }

    const marketConfigs = params.markets || []

    return getVaults({
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

      // Get user's market token balance (shares in the vault)
      const shares = await publicClient.readContract({
        address: params.marketId.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [params.walletAddress],
      })

      // Convert shares to underlying asset balance using convertToAssets
      const balance = await publicClient.readContract({
        address: params.marketId.address,
        abi: [
          {
            name: 'convertToAssets',
            type: 'function',
            stateMutability: 'view',
            inputs: [{ name: 'shares', type: 'uint256' }],
            outputs: [{ name: '', type: 'uint256' }],
          },
        ],
        functionName: 'convertToAssets',
        args: [shares],
      })

      // Format the balances (USDC has 6 decimals)
      const balanceFormatted = formatUnits(balance, 6)
      const sharesFormatted = formatUnits(shares, 18) // Vault shares typically have 18 decimals

      return {
        balance,
        balanceFormatted,
        shares,
        sharesFormatted,
        chainId: params.marketId.chainId,
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

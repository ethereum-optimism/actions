import { ChainId } from '@morpho-org/blue-sdk'
import { MetaMorphoAction } from '@morpho-org/blue-sdk-viem'
import { encodeFunctionData, erc20Abi, formatUnits, parseUnits } from 'viem'

import { DEFAULT_VERBS_CONFIG } from '@/constants/config.js'
import type { ChainManager } from '@/services/ChainManager.js'

import { SUPPORTED_CHAIN_IDS as VERBS_SUPPORTED_CHAIN_IDS } from '../../../constants/supportedChains.js'
import type {
  GetLendMarketsParams,
  GetMarketBalanceParams,
  LendMarket,
  LendMarketId,
  LendMarketPosition,
  LendOpenPositionParams,
  LendTransaction,
  MorphoLendConfig,
  WithdrawParams,
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
  protected async _openPosition({
    amount,
    asset,
    marketId,
    options,
  }: LendOpenPositionParams): Promise<LendTransaction> {
    try {
      // Get asset address for the chain
      const assetAddress = asset.address[marketId.chainId]
      if (!assetAddress) {
        throw new Error(`Asset not supported on chain ${marketId.chainId}`)
      }

      // Convert human-readable amount to wei using the asset's decimals
      const amountWei = parseUnits(amount.toString(), asset.metadata.decimals)

      // Get vault information for APY
      const vaultInfo = await this.getMarket({
        address: marketId.address,
        chainId: marketId.chainId,
      })

      // Generate real call data for Morpho deposit
      const receiver = options?.receiver
      if (!receiver) {
        throw new Error(
          'Receiver address is required for Morpho deposit operation',
        )
      }
      const depositCallData = MetaMorphoAction.deposit(amountWei, receiver)

      // Create approval transaction data if needed
      const approvalCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [marketId.address, amountWei],
      })

      // Return transaction details with real call data
      const currentTimestamp = Math.floor(Date.now() / 1000)

      return {
        amount: amountWei,
        asset: assetAddress,
        marketId: marketId.address,
        apy: vaultInfo.apy,
        timestamp: currentTimestamp,
        transactionData: {
          // Approval transaction
          approval: {
            to: assetAddress,
            data: approvalCallData,
            value: 0n,
          },
          // Deposit transaction
          deposit: {
            to: marketId.address,
            data: depositCallData,
            value: 0n,
          },
        },
        slippage: options?.slippage || this._config.defaultSlippage,
      }
    } catch (error) {
      throw new Error(
        `Failed to open position with ${amount} of ${asset.metadata.symbol}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Close a position in a Morpho market
   * @description Withdraws assets from a Morpho market using Blue_Withdraw operation
   * @param params - Position closing operation parameters
   * @returns Promise resolving to withdrawal transaction details
   */
  protected async _closePosition({
    asset,
    amount,
    chainId,
    marketId,
    options,
  }: WithdrawParams): Promise<LendTransaction> {
    // TODO: Implement withdrawal functionality

    const _unused = { asset, amount, chainId, marketId, options }
    throw new Error('Close position functionality not yet implemented')
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
  protected async _getMarkets({
    asset: _asset,
    chainId: _chainId,
    markets,
  }: GetLendMarketsParams): Promise<LendMarket[]> {
    // We will eventually fetch markets externally, filtered by Asset and chainId
    const _unused = { asset: _asset, chainId: _chainId }

    const marketConfigs = markets || []

    return getVaults({
      chainManager: this.chainManager,
      lendConfig: this._config,
      markets: marketConfigs,
    })
  }

  /**
   * Get market balance for a specific wallet address
   * @param params - Parameters for fetching market balance
   * @returns Promise resolving to market balance information
   */
  protected async _getMarketBalance({
    marketId,
    walletAddress,
  }: GetMarketBalanceParams): Promise<LendMarketPosition> {
    try {
      const publicClient = this.chainManager.getPublicClient(marketId.chainId)

      // Get user's market token balance (shares in the vault)
      const shares = await publicClient.readContract({
        address: marketId.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress],
      })

      // Convert shares to underlying asset balance using convertToAssets
      const balance = await publicClient.readContract({
        address: marketId.address,
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
        chainId: marketId.chainId,
      }
    } catch (error) {
      throw new Error(
        `Failed to get market balance for ${walletAddress} in market ${marketId.address}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }
}

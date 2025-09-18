import { MetaMorphoAction } from '@morpho-org/blue-sdk-viem'
import type { Address } from 'viem'
import { encodeFunctionData, erc20Abi, formatUnits } from 'viem'
import { baseSepolia } from 'viem/chains'

import { DEFAULT_VERBS_CONFIG } from '@/constants/config.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { findMarketInAllowlist } from '@/utils/config.js'

import type { SupportedChainId } from '../../../constants/supportedChains.js'
import type {
  LendMarket,
  LendMarketId,
  LendOptions,
  LendTransaction,
  MorphoLendConfig,
} from '../../../types/lend.js'
import { LendProvider } from '../../provider.js'
import { findBestVaultForAsset, getVault, getVaults } from './sdk.js'

/**
 * Supported networks for Morpho lending
 */
export const SUPPORTED_NETWORKS = {
  UNICHAIN: {
    chainId: 130,
    name: 'Unichain',
    morphoAddress: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as Address,
  },
  BASE_SEPOLIA: {
    chainId: baseSepolia.id,
    name: 'Base Sepolia',
    morphoAddress: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
  },
} as const

/**
 * Morpho lending provider implementation
 * @description Lending provider implementation using Morpho protocol
 */
export class LendProviderMorpho extends LendProvider<MorphoLendConfig> {
  protected readonly SUPPORTED_NETWORKS = SUPPORTED_NETWORKS

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
   * Lend assets to a Morpho market
   * @description Supplies assets to a Morpho market using MetaMorpho deposit operation
   * @param asset - Asset token address to lend
   * @param amount - Amount to lend (in wei)
   * @param marketId - Optional specific market ID (vault address)
   * @param options - Optional lending configuration
   * @returns Promise resolving to lending transaction details
   */
  async lend(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    try {
      // 1. Find suitable vault if marketId not provided
      const selectedVaultAddress =
        (marketId as Address) ||
        (await findBestVaultForAsset(asset, this._config.marketAllowlist || []))

      // 2. Get vault information for APY
      const vaultInfo = await this.getMarket({
        address: selectedVaultAddress,
        chainId: 130 as SupportedChainId, // TODO: Get chain ID dynamically
      })

      // 3. Generate real call data for Morpho deposit
      const receiver = options?.receiver
      if (!receiver) {
        throw new Error(
          'Receiver address is required for Morpho deposit operation',
        )
      }
      const depositCallData = MetaMorphoAction.deposit(amount, receiver)

      // 4. Create approval transaction data for USDC if needed
      const approvalCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [selectedVaultAddress, amount],
      })

      // 5. Return transaction details with real call data
      const currentTimestamp = Math.floor(Date.now() / 1000)

      return {
        amount,
        asset,
        marketId: selectedVaultAddress,
        apy: vaultInfo.apy,
        timestamp: currentTimestamp,
        transactionData: {
          // Approval transaction
          approval: {
            to: asset,
            data: approvalCallData,
            value: 0n,
          },
          // Deposit transaction
          deposit: {
            to: selectedVaultAddress,
            data: depositCallData,
            value: 0n,
          },
        },
        slippage:
          options?.slippage ||
          this._config.defaultSlippage ||
          DEFAULT_VERBS_CONFIG.lend.defaultSlippage,
      }
    } catch (error) {
      throw new Error(
        `Failed to lend ${amount} of ${asset}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Deposit assets to a Morpho market (alias for lend)
   * @description Supplies assets to a Morpho market using MetaMorpho deposit operation
   * @param asset - Asset token address to deposit
   * @param amount - Amount to deposit (in wei)
   * @param marketId - Optional specific market ID (vault address)
   * @param options - Optional deposit configuration
   * @returns Promise resolving to deposit transaction details
   */
  async deposit(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    return this.lend(asset, amount, marketId, options)
  }

  /**
   * Withdraw assets from a Morpho market
   * @description Withdraws assets from a Morpho market using Blue_Withdraw operation
   * @param asset - Asset token address to withdraw
   * @param amount - Amount to withdraw (in wei)
   * @param marketId - Optional specific market ID
   * @param options - Optional withdrawal configuration
   * @returns Promise resolving to withdrawal transaction details
   */
  async withdraw(
    asset: Address,
    amount: bigint,
    marketId?: string,
    options?: LendOptions,
  ): Promise<LendTransaction> {
    // TODO: Implement withdrawal functionality

    const _unused = { asset, amount, marketId, options }
    throw new Error('Withdraw functionality not yet implemented')
  }

  /**
   * Get detailed market information
   * @param marketId - Market identifier containing address and chainId
   * @returns Promise resolving to market information
   */
  async getMarket(marketId: LendMarketId): Promise<LendMarket> {
    // Check if market is in allowlist
    const config = findMarketInAllowlist(this._config.marketAllowlist, marketId)
    if (!config) {
      throw new Error(`Vault ${marketId.address} not found in market allowlist`)
    }

    return getVault({
      marketId,
      chainManager: this.chainManager,
      marketAllowlist: this._config.marketAllowlist,
    })
  }

  /**
   * Get list of available lending markets
   * @returns Promise resolving to array of market information
   */
  async getMarkets(): Promise<LendMarket[]> {
    if (
      !this._config.marketAllowlist ||
      this._config.marketAllowlist.length === 0
    ) {
      throw new Error('Market allowlist is required and cannot be empty')
    }
    return getVaults(this.chainManager, this._config.marketAllowlist)
  }

  /**
   * Get market balance for a specific wallet address
   * @param marketId - Market identifier containing address and chainId
   * @param walletAddress - User wallet address to check balance for
   * @returns Promise resolving to market balance information
   */
  async getMarketBalance(
    marketId: LendMarketId,
    walletAddress: Address,
  ): Promise<{
    balance: bigint
    balanceFormatted: string
    shares: bigint
    sharesFormatted: string
    chainId: number
  }> {
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

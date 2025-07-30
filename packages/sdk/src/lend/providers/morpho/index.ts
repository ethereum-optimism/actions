import { MetaMorphoAction } from '@morpho-org/blue-sdk-viem'
import type { Address, PublicClient } from 'viem'
import { encodeFunctionData, erc20Abi } from 'viem'

import type {
  LendOptions,
  LendTransaction,
  LendVaultInfo,
  MorphoLendConfig,
} from '../../../types/lend.js'
import { LendProvider } from '../../provider.js'
import {
  findBestVaultForAsset,
  getVaultInfo as getVaultInfoHelper,
  getVaults as getVaultsHelper,
} from './vaults.js'

/**
 * Supported networks for Morpho lending
 */
export const SUPPORTED_NETWORKS = {
  UNICHAIN: {
    chainId: 130,
    name: 'Unichain',
    morphoAddress: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as Address,
  },
} as const

/**
 * Morpho lending provider implementation
 * @description Lending provider implementation using Morpho protocol
 */
export class LendProviderMorpho extends LendProvider {
  protected readonly SUPPORTED_NETWORKS = SUPPORTED_NETWORKS

  /** TODO: refactor. for now, this only supports Unichain */
  private morphoAddress: Address
  private defaultSlippage: number
  private publicClient: PublicClient

  /**
   * Create a new Morpho lending provider
   * @param config - Morpho lending configuration
   * @param publicClient - Viem public client for blockchain interactions // TODO: remove this
   */
  constructor(config: MorphoLendConfig, publicClient: PublicClient) {
    super()

    // Use Unichain as the default network for now
    const network = SUPPORTED_NETWORKS.UNICHAIN

    this.morphoAddress = network.morphoAddress
    this.defaultSlippage = config.defaultSlippage || 50 // 0.5% default
    this.publicClient = publicClient
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
        (marketId as Address) || (await findBestVaultForAsset(asset))

      // 2. Get vault information for APY
      const vaultInfo = await this.getVault(selectedVaultAddress)

      // 3. Generate real call data for Morpho deposit
      const receiver = options?.receiver
      if (!receiver) {
        throw new Error('Receiver address is required for Morpho deposit operation')
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
        hash: `morpho-lend-${Date.now()}`, // Placeholder hash
        amount,
        asset,
        marketId: selectedVaultAddress,
        apy: vaultInfo.apy,
        timestamp: currentTimestamp,
        // Add transaction data for wallet execution
        transactionData: {
          // Approval transaction (if needed)
          approval: {
            to: asset,
            data: approvalCallData,
            value: '0x0',
          },
          // Deposit transaction
          deposit: {
            to: selectedVaultAddress,
            data: depositCallData,
            value: '0x0',
          },
        },
        slippage: options?.slippage || this.defaultSlippage,
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
   * Get detailed vault information
   * @param vaultAddress - Vault address
   * @returns Promise resolving to vault information
   */
  async getVault(vaultAddress: Address): Promise<LendVaultInfo> {
    return getVaultInfoHelper(vaultAddress, this.publicClient)
  }

  /**
   * Get list of available vaults
   * @returns Promise resolving to array of vault information
   */
  async getVaults(): Promise<LendVaultInfo[]> {
    return getVaultsHelper(this.publicClient)
  }

  /**
   * Get detailed vault information (legacy naming)
   * @param vaultAddress - Vault address
   * @returns Promise resolving to vault information
   * @deprecated Use getVault instead
   */
  async getVaultInfo(vaultAddress: Address): Promise<LendVaultInfo> {
    return this.getVault(vaultAddress)
  }
}

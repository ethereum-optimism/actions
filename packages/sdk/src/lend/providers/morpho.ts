import type { AccrualPosition, IToken, MarketId } from '@morpho-org/blue-sdk'
import { fetchAccrualVault, fetchMarket } from '@morpho-org/blue-sdk-viem'
import { Time } from '@morpho-org/morpho-ts'
import type { Address, PublicClient } from 'viem'

import type {
  LendMarketInfo,
  LendOptions,
  LendProvider,
  LendTransaction,
  LendVaultInfo,
  MorphoLendConfig,
} from '../../types/lend.js'

// Extended vault config type for internal use
interface VaultConfig {
  address: Address
  name: string
  asset: IToken & { address: Address }
}

// Extended market config type for internal use (deprecated - for backward compatibility)
interface MarketConfig {
  id: string
  loanToken: IToken & { address: Address }
  collateralToken: IToken & { address: Address }
}

/**
 * Supported vaults on Unichain for Morpho lending
 * @description Static configuration of supported vaults for initial launch
 */
const SUPPORTED_VAULTS: VaultConfig[] = [
  {
    // Gauntlet USDC vault - primary supported vault
    address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address,
    name: 'Gauntlet USDC',
    asset: {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address, // USDC on Unichain
      symbol: 'USDC',
      decimals: 6n,
      name: 'USD Coin',
    },
  },
]

/**
 * Supported networks for Morpho lending
 * @description Networks where Morpho is deployed and supported
 */
const SUPPORTED_NETWORKS = {
  UNICHAIN: {
    chainId: 130,
    name: 'Unichain',
    morphoAddress: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb' as Address,
    bundlerAddress: '0x23055618898e202386e6c13955a58D3C68200BFB' as Address,
  },
} as const

/**
 * Morpho lending provider implementation
 * @description Lending provider implementation using Morpho protocol
 */
export class LendProviderMorpho implements LendProvider {
  /** Morpho protocol address for Unichain */
  private morphoAddress: Address
  /** Bundler address for transaction bundling on Unichain */
  private bundlerAddress: Address
  private defaultSlippage: number
  private publicClient: PublicClient

  /**
   * Create a new Morpho lending provider
   * @param config - Morpho lending configuration
   * @param publicClient - Viem public client for blockchain interactions
   */
  constructor(config: MorphoLendConfig, publicClient: PublicClient) {
    // Use Unichain as the default network for now
    const network = SUPPORTED_NETWORKS.UNICHAIN

    this.morphoAddress = network.morphoAddress
    this.bundlerAddress = network.bundlerAddress
    this.defaultSlippage = config.defaultSlippage || 50 // 0.5% default
    this.publicClient = publicClient
  }

  /**
   * Lend assets to a Morpho market
   * @description Supplies assets to a Morpho market using Blue_Supply operation
   * @param asset - Asset token address to lend
   * @param amount - Amount to lend (in wei)
   * @param marketId - Optional specific market ID
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
      // 1. Find suitable market if marketId not provided
      const selectedMarketId =
        marketId || (await this.findBestMarketForAsset(asset))

      // 2. Get market information for APY calculation
      const marketInfo = await this.getMarketInfo(selectedMarketId)

      // 3. Create transaction data (mock implementation)
      const transactionData = {
        to: this.morphoAddress,
        data: '0x' + Math.random().toString(16).substring(2, 66), // Mock transaction data
        value: '0x0',
        slippage: options?.slippage || this.defaultSlippage,
      }

      // 4. Return transaction details (actual execution will be handled by wallet)
      const currentTimestamp = Math.floor(Date.now() / 1000)

      return {
        hash: JSON.stringify(transactionData).slice(0, 66), // Use first 66 chars as placeholder hash
        amount,
        asset,
        marketId: selectedMarketId,
        apy: marketInfo.supplyApy,
        timestamp: currentTimestamp,
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
    _asset: Address,
    _amount: bigint,
    _marketId?: string,
    _options?: LendOptions,
  ): Promise<LendTransaction> {
    // TODO: Implement withdrawal functionality
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _unused = { _asset, _amount, _marketId, _options }
    throw new Error('Withdraw functionality not yet implemented')
  }

  /**
   * Get supported network IDs
   * @description Returns an array of chain IDs that this provider supports
   * @returns Array of supported network chain IDs
   */
  supportedNetworkIds(): number[] {
    return Object.values(SUPPORTED_NETWORKS).map((network) => network.chainId)
  }

  /**
   * Get detailed vault information
   * @description Retrieves comprehensive information about a specific vault
   * @param vaultAddress - Vault address
   * @returns Promise resolving to detailed vault information
   */
  async getVaultInfo(vaultAddress: Address): Promise<LendVaultInfo> {
    try {
      // 1. Fetch vault configuration for validation
      const vaultConfigs = await this.fetchVaultConfigs()
      const config = vaultConfigs.find((c) => c.address === vaultAddress)

      if (!config) {
        throw new Error(`Vault ${vaultAddress} not found`)
      }

      // 2. Fetch live vault data from Morpho SDK with APY calculation
      const vault = await fetchAccrualVault(vaultAddress, this.publicClient)

      // 3. Convert Morpho SDK data to our interface format
      const currentTimestampSeconds = Math.floor(Date.now() / 1000)

      // Calculate APY - work around the Morpho SDK bug with allocations
      let apy = 0

      try {
        if (vault.totalAssets === 0n) {
          apy = 0
        } else {
          // Convert allocations Map to array and calculate weighted APY
          const allocationsArray = Array.from(vault.allocations.values())

          const totalWeightedApy = allocationsArray.reduce(
            (total, allocation) => {
              const position: AccrualPosition = allocation.position
              const market = position.market

              if (market && position.supplyShares > 0n) {
                // eslint-disable-next-line no-console
                console.log('\n=== MARKET APY INVESTIGATION ===')
                // eslint-disable-next-line no-console
                console.log(
                  'market.getAvgSupplyApy():',
                  `${((Number(market.getAvgSupplyApy()) / 1e18) * 100).toFixed(2)}%`,
                )

                // Get current supply assets and market APY
                const supplyAssets = position.supplyAssets
                const marketSupplyApy = market.supplyApy || 0n

                // Calculate weighted APY for this allocation
                return total + marketSupplyApy * supplyAssets
              }
              return total
            },
            0n,
          )

          // Calculate base APY (before fees)
          const baseApyBigInt = totalWeightedApy / vault.totalAssets
          const baseApy = Number(baseApyBigInt) / 1e18

          // Apply vault fee (fee is in WAD format, 1e18 = 100%)
          const vaultFeeRate = Number(vault.fee) / 1e18
          apy = baseApy * (1 - vaultFeeRate)
        }
      } catch (calculationError) {
        // If manual calculation fails, log error and return 0
        // eslint-disable-next-line no-console
        console.error(
          'Failed to calculate vault APY manually:',
          calculationError,
        )
        apy = 0
      }

      // Note: This APY does not include additional rewards (e.g., token incentives)
      // which may be distributed separately. The Morpho UI shows "APY + Rewards - Fees"
      // but the SDK only provides the base lending APY.

      return {
        address: vaultAddress,
        name: config.name,
        asset: config.asset.address,
        totalAssets: vault.totalAssets,
        totalShares: vault.totalSupply,
        apy,
        owner: vault.owner,
        curator: vault.curator,
        fee: Number(vault.fee) / 1e18, // Convert from WAD to decimal percentage
        depositCapacity: vault.totalAssets, // Placeholder - would need actual capacity logic
        withdrawalCapacity: vault.totalAssets, // Placeholder - would need actual capacity logic
        lastUpdate: currentTimestampSeconds,
      }
    } catch (error) {
      throw new Error(
        `Failed to get vault info for ${vaultAddress}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Get list of available vaults
   * @description Retrieves information about all supported vaults
   * @returns Promise resolving to array of vault information
   */
  async getVaults(): Promise<LendVaultInfo[]> {
    try {
      const vaultConfigs = await this.fetchVaultConfigs()
      const vaultInfoPromises = vaultConfigs.map((config) =>
        this.getVaultInfo(config.address),
      )
      return await Promise.all(vaultInfoPromises)
    } catch (error) {
      throw new Error(
        `Failed to get vaults: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Get detailed market information (deprecated - use getVaultInfo)
   * @description Retrieves comprehensive information about a specific market
   * @param marketId - Market identifier
   * @returns Promise resolving to detailed market information
   * @deprecated Use getVaultInfo instead
   */
  async getMarketInfo(marketId: string): Promise<LendMarketInfo> {
    try {
      // 1. Fetch market configuration for validation
      const marketConfigs = await this.fetchMarketConfigs()
      const config = marketConfigs.find((c) => c.id === marketId)

      if (!config) {
        throw new Error(`Market ${marketId} not found`)
      }

      // 2. Fetch live market data from Morpho SDK
      const market = await fetchMarket(marketId as MarketId, this.publicClient)

      // 3. Accrue interest to get current values
      const currentTimestamp = Time.timestamp()
      const accruedMarket = market.accrueInterest(currentTimestamp)

      // 4. Convert Morpho SDK data to our interface format
      const currentTimestampSeconds = Math.floor(Date.now() / 1000)

      // Convert WAD-scaled values to decimal percentages
      const supplyApy = Number(accruedMarket.supplyApy) / 1e18
      const borrowApy = Number(accruedMarket.borrowApy) / 1e18
      const utilization = Number(accruedMarket.utilization) / 1e18

      return {
        id: marketId,
        name: `${config.loanToken.symbol}/${config.collateralToken.symbol} Market`,
        loanToken: config.loanToken.address,
        collateralToken: config.collateralToken.address,
        supplyApy,
        utilization,
        liquidity: accruedMarket.liquidity,
        oracle: market.params.oracle,
        irm: market.params.irm,
        lltv: Number(market.params.lltv) / 1e18, // Convert from BigInt to decimal
        totalSupply: accruedMarket.totalSupplyAssets,
        totalBorrow: accruedMarket.totalBorrowAssets,
        supplyRate: BigInt(Math.floor(supplyApy * 1e18)), // Convert back to BigInt for interface
        borrowRate: BigInt(Math.floor(borrowApy * 1e18)), // Convert back to BigInt for interface
        lastUpdate: currentTimestampSeconds,
      }
    } catch (error) {
      throw new Error(
        `Failed to get market info for ${marketId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      )
    }
  }

  /**
   * Find the best vault for a given asset
   * @param asset - Asset token address
   * @returns Promise resolving to vault address
   */
  private async findBestVaultForAsset(asset: Address): Promise<Address> {
    // Filter supported vaults by asset
    const assetVaults = SUPPORTED_VAULTS.filter(
      (vault) => vault.asset.address === asset,
    )

    if (assetVaults.length === 0) {
      throw new Error(`No vaults available for asset ${asset}`)
    }

    // For now, return the first (and likely only) supported vault for the asset
    // TODO: In the future, this could compare APYs from live vault data
    return assetVaults[0].address
  }

  /**
   * Find the best market for a given asset (deprecated)
   * @param asset - Asset token address
   * @returns Promise resolving to market ID
   * @deprecated Use findBestVaultForAsset instead
   */
  private async findBestMarketForAsset(asset: Address): Promise<string> {
    // For backward compatibility, find a vault and return its address as string
    const vaultAddress = await this.findBestVaultForAsset(asset)
    return vaultAddress
  }

  /**
   * Fetch vault configurations from static supported vaults
   * @returns Promise resolving to array of supported vault configurations
   */
  private async fetchVaultConfigs(): Promise<VaultConfig[]> {
    // Return statically configured supported vaults for Unichain
    // TODO: In the future, this could be enhanced to fetch live vault data
    // from Morpho's API or subgraph for additional validation
    return SUPPORTED_VAULTS
  }

  /**
   * Fetch market configurations from static supported markets (deprecated)
   * @returns Promise resolving to array of supported market configurations
   * @deprecated Use fetchVaultConfigs instead
   */
  private async fetchMarketConfigs(): Promise<MarketConfig[]> {
    // For backward compatibility, convert vaults to market-like objects
    const vaultConfigs = await this.fetchVaultConfigs()
    return vaultConfigs.map((vault) => ({
      id: vault.address,
      loanToken: vault.asset,
      collateralToken: vault.asset, // Not applicable for vaults
    }))
  }
}

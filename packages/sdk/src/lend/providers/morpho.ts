import type { AccrualPosition, IToken, MarketId } from '@morpho-org/blue-sdk'
import { fetchAccrualVault, fetchMarket } from '@morpho-org/blue-sdk-viem'
import { Time } from '@morpho-org/morpho-ts'
import type { Address, PublicClient } from 'viem'

import type {
  ApyBreakdown,
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
   * Calculate base vault APY from SDK data
   * @private
   * @param vault - Vault data from Morpho SDK
   * @returns Base APY (before rewards, after fees)
   */
  private calculateBaseApy(vault: any): number {
    try {
      if (vault.totalAssets === 0n) {
        return 0
      }

      // Convert allocations Map to array and calculate weighted APY
      const allocationsArray = Array.from(vault.allocations.values())

      const totalWeightedApy = allocationsArray.reduce(
        (total: bigint, allocation: any) => {
          const position: AccrualPosition = allocation.position
          const market = position.market

          if (market && position.supplyShares > 0n) {
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
      return baseApy * (1 - vaultFeeRate)
    } catch (calculationError) {
      // eslint-disable-next-line no-console
      console.error('Failed to calculate vault APY manually:', calculationError)
      return 0
    }
  }

  /**
   * Fetch rewards data from Morpho GraphQL API
   * @private
   * @param vaultAddress - Vault address
   * @returns Promise resolving to rewards breakdown or null if failed
   */
  private async fetchRewardsFromApi(vaultAddress: Address): Promise<{
    usdcRewardsApr: number
    morphoRewardsApr: number
    otherRewardsApr: number
    totalRewardsApr: number
  }> {
    const graphqlEndpoint = 'https://api.morpho.org/graphql'
    const vaultQuery = {
      query: `
        query VaultByAddress($address: String!, $chainId: Int) {
          vaultByAddress(address: $address, chainId: $chainId) {
            address
            state {
              rewards {
                asset {
                  address
                  name
                }
                amountPerSuppliedToken
                supplyApr
              }
              allocation {
                market {
                  uniqueKey
                  state {
                    rewards {
                      supplyApr
                      amountPerSuppliedToken
                      asset {
                        address
                        chain {
                          id
                        }
                      }
                    }
                  }
                }
                supplyAssetsUsd
              }
            }
            chain {
              id
            }
          }
        }
      `,
      variables: {
        address: vaultAddress.toLowerCase(),
        chainId: 130,
      },
    }

    try {
      const response = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(vaultQuery),
      })

      const vaultData = (await response.json()) as any

      if (!vaultData.data?.vaultByAddress) {
        return {
          usdcRewardsApr: 0,
          morphoRewardsApr: 0,
          otherRewardsApr: 0,
          totalRewardsApr: 0,
        }
      }

      return this.calculateRewardsBreakdown(vaultData.data.vaultByAddress)
    } catch (apiError) {
      // eslint-disable-next-line no-console
      console.error('Failed to fetch rewards from GraphQL API:', apiError)
      return {
        usdcRewardsApr: 0,
        morphoRewardsApr: 0,
        otherRewardsApr: 0,
        totalRewardsApr: 0,
      }
    }
  }

  /**
   * Calculate detailed rewards breakdown from vault and market allocations
   * @private
   * @param apiVault - Vault data from GraphQL API
   * @returns Detailed rewards breakdown
   */
  private calculateRewardsBreakdown(apiVault: any): {
    usdcRewardsApr: number
    morphoRewardsApr: number
    otherRewardsApr: number
    totalRewardsApr: number
  } {
    let usdcRewardsApr = 0
    let morphoRewardsApr = 0
    let otherRewardsApr = 0

    // Known token addresses for categorization
    // Based on the API response, we need to categorize by chain ID and token address
    const USDC_ADDRESSES = [
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Unichain
      '0xA0b86a33E6416eFB1e57D696bDc080e07a4aE3d1', // USDC on Ethereum
    ]
    const MORPHO_ADDRESSES = [
      '0x078D782b760474a361dDA0AF3839290b0EF57AD6', // MORPHO on Unichain
      '0x58D97B57BB95320F9a05dC918Aef65434969c2B2', // MORPHO on Ethereum
    ]

    // Helper function to categorize rewards by chain and token
    const categorizeReward = (assetAddress: string, chainId: number) => {
      const normalizedAddress = assetAddress.toLowerCase()

      // For rewards from Ethereum (chain ID 1), categorize as MORPHO rewards
      // For rewards from Unichain (chain ID 130), categorize as USDC rewards
      // This is based on the observation that the UI shows USDC rewards (3.15%) > MORPHO rewards (1.22%)
      // and our current data shows chain 130 rewards (3.16%) > chain 1 rewards (1.22%)
      if (chainId === 1) {
        return 'morpho' // Ethereum-based rewards are MORPHO rewards
      } else if (chainId === 130) {
        return 'usdc' // Unichain-based rewards are USDC rewards
      } else if (
        USDC_ADDRESSES.some((addr) => addr.toLowerCase() === normalizedAddress)
      ) {
        return 'usdc'
      } else if (
        MORPHO_ADDRESSES.some(
          (addr) => addr.toLowerCase() === normalizedAddress,
        )
      ) {
        return 'morpho'
      } else {
        return 'other'
      }
    }

    // Calculate vault-level rewards
    if (apiVault.state?.rewards && apiVault.state.rewards.length > 0) {
      apiVault.state.rewards.forEach((reward: any) => {
        const rewardApr = reward.supplyApr || 0
        const assetAddress = reward.asset.address
        const chainId = reward.asset.chain?.id || 130 // Default to Unichain

        // eslint-disable-next-line no-console
        console.log(
          `Vault reward (${reward.asset.name}, chain ${chainId}):`,
          `${(rewardApr * 100).toFixed(2)}%`,
        )

        const category = categorizeReward(assetAddress, chainId)
        if (category === 'usdc') {
          usdcRewardsApr += rewardApr
        } else if (category === 'morpho') {
          morphoRewardsApr += rewardApr
        } else {
          otherRewardsApr += rewardApr
        }
      })
    }

    // Calculate market-level rewards (weighted by allocation)
    if (apiVault.state?.allocation && apiVault.state.allocation.length > 0) {
      const totalSupplyUsd = apiVault.state.allocation.reduce(
        (total: number, alloc: any) => {
          return total + (alloc.supplyAssetsUsd || 0)
        },
        0,
      )

      apiVault.state.allocation.forEach((allocation: any) => {
        if (
          allocation.market?.state?.rewards &&
          allocation.market.state.rewards.length > 0
        ) {
          const weight =
            totalSupplyUsd > 0
              ? (allocation.supplyAssetsUsd || 0) / totalSupplyUsd
              : 0

          allocation.market.state.rewards.forEach((reward: any) => {
            const rewardApr = reward.supplyApr || 0
            const weightedRewardApr = rewardApr * weight
            const assetAddress = reward.asset.address
            const chainId = reward.asset.chain?.id || 130 // Default to Unichain

            // eslint-disable-next-line no-console
            console.log(
              `Market reward (${allocation.market.uniqueKey}, chain ${chainId}):`,
              `${(rewardApr * 100).toFixed(2)}% (weighted: ${(weightedRewardApr * 100).toFixed(2)}%)`,
            )

            const category = categorizeReward(assetAddress, chainId)
            if (category === 'usdc') {
              usdcRewardsApr += weightedRewardApr
            } else if (category === 'morpho') {
              morphoRewardsApr += weightedRewardApr
            } else {
              otherRewardsApr += weightedRewardApr
            }
          })
        }
      })
    }

    const totalRewardsApr = usdcRewardsApr + morphoRewardsApr + otherRewardsApr

    // eslint-disable-next-line no-console
    console.log('Rewards breakdown:')
    // eslint-disable-next-line no-console
    console.log(`  USDC rewards: ${(usdcRewardsApr * 100).toFixed(2)}%`)
    // eslint-disable-next-line no-console
    console.log(`  MORPHO rewards: ${(morphoRewardsApr * 100).toFixed(2)}%`)
    // eslint-disable-next-line no-console
    console.log(`  Other rewards: ${(otherRewardsApr * 100).toFixed(2)}%`)
    // eslint-disable-next-line no-console
    console.log(`  Total rewards: ${(totalRewardsApr * 100).toFixed(2)}%`)

    return {
      usdcRewardsApr,
      morphoRewardsApr,
      otherRewardsApr,
      totalRewardsApr,
    }
  }

  /**
   * Get detailed vault information with enhanced rewards data
   * @description Retrieves comprehensive information about a specific vault including rewards from Morpho's API
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

      // 2. Fetch live vault data from Morpho SDK
      const vault = await fetchAccrualVault(vaultAddress, this.publicClient)

      // 3. Calculate base APY from SDK data (before fees)
      const baseApyBeforeFees =
        this.calculateBaseApy(vault) / (1 - Number(vault.fee) / 1e18) // Reverse the fee application to get before-fees APY
      const performanceFee = Number(vault.fee) / 1e18

      // 4. Fetch rewards data from API
      const rewardsBreakdown = await this.fetchRewardsFromApi(vaultAddress)

      // 5. Calculate net APY following simplified methodology
      // Net APY = Native APY + Rewards APRs - (Performance Fee × Native APY)
      const performanceFeeImpact = baseApyBeforeFees * performanceFee
      const netApy =
        baseApyBeforeFees +
        rewardsBreakdown.totalRewardsApr -
        performanceFeeImpact

      const apyBreakdown: ApyBreakdown = {
        nativeApy: baseApyBeforeFees, // Native APY from market lending (before fees)
        totalRewardsApr: rewardsBreakdown.totalRewardsApr,
        usdcRewardsApr: rewardsBreakdown.usdcRewardsApr,
        morphoRewardsApr: rewardsBreakdown.morphoRewardsApr,
        otherRewardsApr: rewardsBreakdown.otherRewardsApr,
        performanceFee: performanceFee,
        netApy: netApy,
      }

      // eslint-disable-next-line no-console
      console.log('APY Breakdown:')
      // eslint-disable-next-line no-console
      console.log(`  Native APY: ${(apyBreakdown.nativeApy * 100).toFixed(2)}%`)
      // eslint-disable-next-line no-console
      console.log(
        `  USDC rewards: ${(apyBreakdown.usdcRewardsApr! * 100).toFixed(2)}%`,
      )
      // eslint-disable-next-line no-console
      console.log(
        `  MORPHO rewards: ${(apyBreakdown.morphoRewardsApr! * 100).toFixed(2)}%`,
      )
      // eslint-disable-next-line no-console
      console.log(
        `  Performance fee rate: ${(apyBreakdown.performanceFee * 100).toFixed(2)}%`,
      )
      // eslint-disable-next-line no-console
      console.log(
        `  Performance fee impact: ${(performanceFeeImpact * 100).toFixed(2)}%`,
      )
      // eslint-disable-next-line no-console
      console.log(`  Net APY: ${(apyBreakdown.netApy * 100).toFixed(2)}%`)

      // 7. Return comprehensive vault information
      const currentTimestampSeconds = Math.floor(Date.now() / 1000)

      return {
        address: vaultAddress,
        name: config.name,
        asset: config.asset.address,
        totalAssets: vault.totalAssets,
        totalShares: vault.totalSupply,
        apy: apyBreakdown.netApy, // Use Net APY calculation
        apyBreakdown: apyBreakdown, // Detailed breakdown
        owner: vault.owner,
        curator: vault.curator,
        fee: performanceFee,
        depositCapacity: vault.totalAssets,
        withdrawalCapacity: vault.totalAssets,
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

import type { AccrualPosition } from '@morpho-org/blue-sdk'
import { fetchAccrualVault } from '@morpho-org/blue-sdk-viem'
import type { Address } from 'viem'
import { parseEther } from 'viem'

import {
  fetchRewards,
  type RewardsBreakdown,
} from '@/lend/providers/morpho/api.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type {
  ApyBreakdown,
  LendConfig,
  LendMarket,
  LendMarketConfig,
  LendMarketId,
} from '@/types/lend/index.js'

/**
 * Fetch and calculate rewards breakdown from Morpho GraphQL API
 * @param vaultAddress - Vault address
 * @returns Promise resolving to rewards breakdown
 */
export async function fetchAndCalculateRewards(
  vaultAddress: Address,
): Promise<RewardsBreakdown> {
  const vaultData = await fetchRewards(vaultAddress)

  if (!vaultData) {
    // Initialize empty rewards object with all supported tokens + other
    const emptyRewards: Record<string, number> = {
      other: 0,
      totalRewards: 0,
    }

    // Add all supported tokens (lowercase) to the rewards object
    SUPPORTED_TOKENS.forEach((token) => {
      emptyRewards[token.metadata.symbol.toLowerCase()] = 0
    })

    return emptyRewards as unknown as RewardsBreakdown
  }

  return calculateRewardsBreakdown(vaultData)
}

/**
 * Calculate base vault APY from SDK data
 * @param vault - Vault data from Morpho SDK
 * @returns Base APY (before rewards, after fees)
 */
export function calculateBaseApy(vault: any): number {
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
 * TEMPORARY - To be removed in https://github.com/ethereum-optimism/verbs/issues/112
 * Create mock vault data for Base Sepolia (testnet)
 * @param marketId - Market identifier
 * @param marketConfig - Market configuration from allowlist
 * @returns Mock vault data with realistic values
 */
function createMockVaultData(
  marketId: LendMarketId,
  marketConfig: LendMarketConfig,
): LendMarket {
  const mockApyBreakdown: ApyBreakdown = {
    total: 0.0542, // 5.42% net APY
    native: 0.058, // 5.8% gross APY
    totalRewards: 0.0235, // Total rewards APR
    usdc: 0.0125, // USDC rewards
    morpho: 0.008, // MORPHO token rewards
    other: 0.003, // Other protocol rewards
    performanceFee: 0.065, // 6.5% performance fee
  }

  return {
    marketId,
    name: marketConfig.name,
    asset: marketConfig.asset,
    supply: {
      totalAssets: parseEther('125000'), // ~$125K TVL
      totalShares: parseEther('120000'), // Slightly lower shares (some yield accrued)
    },
    apy: mockApyBreakdown,
    metadata: {
      owner: '0x742d35Cc6464C42C0b15De2C4c98F7E8c3e0F1d9' as Address, // Mock owner
      curator: '0x8f3Cf7ad23Cd3CaDbD9735aff958023239c6A063' as Address, // Mock curator
      fee: mockApyBreakdown.performanceFee,
      lastUpdate: Math.floor(Date.now() / 1000) - 300, // 5 minutes ago
    },
  }
}

/**
 * Parameters for getvault function
 */
interface GetVaultParams {
  /** Market identifier (address and chainId) */
  marketId: LendMarketId
  /** Chain manager instance */
  chainManager: ChainManager
  /** Lend configuration containing market allowlist */
  lendConfig?: LendConfig
}

/**
 * Find market configuration in allowlist
 * @param marketAllowlist - Array of allowed market configurations
 * @param marketId - Market identifier to find
 * @returns Market configuration if found, undefined otherwise
 */
function findMarketInAllowlist(
  marketAllowlist: LendMarketConfig[],
  marketId: LendMarketId,
): LendMarketConfig | undefined {
  return marketAllowlist.find(
    (config) =>
      config.address.toLowerCase() === marketId.address.toLowerCase() &&
      config.chainId === marketId.chainId,
  )
}

/**
 * Get detailed vault information with enhanced rewards data
 * @param params - Named parameters object
 * @returns Promise resolving to detailed vault information
 */
export async function getVault(params: GetVaultParams): Promise<LendMarket> {
  // Find market configuration in allowlist for metadata
  const marketConfig = params.lendConfig?.marketAllowlist
    ? findMarketInAllowlist(params.lendConfig.marketAllowlist, params.marketId)
    : undefined

  if (!marketConfig) {
    throw new Error(
      `Market ${params.marketId.address} on chain ${params.marketId.chainId} not found in allowlist`,
    )
  }

  // Morpho sdk doesn't support base sepolia, so we need to use the mock vault
  if (params.marketId.chainId === 84532) {
    console.log('Using mock vault for base sepolia')
    return createMockVaultData(params.marketId, marketConfig)
  }

  try {
    // Fetch live vault data from Morpho SDK
    const vault = await fetchAccrualVault(
      params.marketId.address,
      params.chainManager.getPublicClient(params.marketId.chainId),
    ).catch((error) => {
      console.error('Failed to fetch vault info:', error)
      return {
        totalAssets: 0n,
        totalSupply: 0n,
        owner: '0x' as Address,
        curator: '0x' as Address,
      }
    })

    // Fetch rewards data from API
    const rewardsBreakdown = await fetchAndCalculateRewards(
      params.marketId.address,
    ).catch((error) => {
      console.error('Failed to fetch rewards data:', error)
      return {
        usdc: 0,
        morpho: 0,
        other: 0,
        totalRewards: 0,
      }
    })

    // Calculate APY breakdown
    const apyBreakdown = calculateApyBreakdown(vault, rewardsBreakdown)

    // Return comprehensive vault information
    const currentTimestampSeconds = Math.floor(Date.now() / 1000)

    return {
      marketId: params.marketId,
      name: marketConfig.name,
      asset: marketConfig.asset,
      supply: {
        totalAssets: vault.totalAssets,
        totalShares: vault.totalSupply,
      },
      apy: apyBreakdown,
      metadata: {
        owner: vault.owner,
        curator: vault.curator,
        fee: apyBreakdown.performanceFee,
        lastUpdate: currentTimestampSeconds,
      },
    }
  } catch (error) {
    console.error('Failed to get vault info:', error)
    throw new Error(
      `Failed to get vault info for ${params.marketId.address}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

interface GetVaultsParams {
  chainManager: ChainManager
  lendConfig: LendConfig
  markets: LendMarketConfig[]
}

export async function getVaults(
  params: GetVaultsParams,
): Promise<LendMarket[]> {
  try {
    const vaultPromises = params.markets.map((marketConfig) => {
      return getVault({
        marketId: {
          address: marketConfig.address,
          chainId: marketConfig.chainId,
        },
        chainManager: params.chainManager,
        lendConfig: params.lendConfig,
      })
    })

    return await Promise.all(vaultPromises)
  } catch (error) {
    throw new Error(
      `Failed to get vaults: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

/**
 * Find the best vault for a given asset
 * @param asset - Asset token address
 * @param marketAllowlist - Required list of allowed markets from backend
 * @returns Promise resolving to vault address
 */
export async function findBestVaultForAsset(
  asset: Address,
  marketAllowlist: LendMarketConfig[],
): Promise<Address> {
  if (!marketAllowlist || marketAllowlist.length === 0) {
    throw new Error('Market allowlist is required and cannot be empty')
  }

  const assetVaults = marketAllowlist.filter((vault) => {
    // LendMarketConfig format
    return Object.values(vault.asset.address).includes(asset)
  })

  if (assetVaults.length === 0) {
    throw new Error(`No vaults available for asset ${asset}`)
  }

  // For now, return the first (and only) supported vault for the asset
  return assetVaults[0].address
}

/**
 * Calculate APY breakdown from vault data and rewards
 * @param vault - Vault data from Morpho SDK
 * @param rewardsBreakdown - Rewards breakdown from API
 * @returns Complete APY breakdown
 */
export function calculateApyBreakdown(
  vault: any,
  rewardsBreakdown: RewardsBreakdown,
): ApyBreakdown {
  // 1. Calculate base APY from SDK data (before fees)
  const baseApyAfterFees = calculateBaseApy(vault)
  const performanceFee = Number(vault.fee) / 1e18
  const baseApyBeforeFees = baseApyAfterFees / (1 - performanceFee) // Reverse the fee application to get before-fees APY

  // 2. Calculate net APY following simplified methodology
  // Net APY = Native APY + Rewards APRs - (Performance Fee × Native APY)
  const performanceFeeImpact = baseApyBeforeFees * performanceFee
  const netApy =
    baseApyBeforeFees + rewardsBreakdown.totalRewards - performanceFeeImpact

  // Extract individual reward token properties (excluding totalRewards aggregate)
  const { totalRewards: _, ...rewardTokens } = rewardsBreakdown

  return {
    total: netApy,
    native: baseApyBeforeFees, // Native APY from market lending (before fees)
    totalRewards: rewardsBreakdown.totalRewards,
    performanceFee: performanceFee,
    ...rewardTokens, // Individual token rewards (usdc, morpho, other)
  }
}

/**
 * Calculate detailed rewards breakdown from vault and market allocations
 * @param apiVault - Vault data from GraphQL API
 * @returns Detailed rewards breakdown
 */
export function calculateRewardsBreakdown(apiVault: any): RewardsBreakdown {
  // Initialize rewards object with all supported tokens + other
  const rewardsByCategory: Record<string, number> = {
    other: 0,
  }

  // Add all supported tokens (lowercase) to the rewards object
  SUPPORTED_TOKENS.forEach((token) => {
    rewardsByCategory[token.metadata.symbol.toLowerCase()] = 0
  })

  // Calculate vault-level rewards
  if (apiVault.state?.rewards && apiVault.state.rewards.length > 0) {
    apiVault.state.rewards.forEach((reward: any) => {
      const rewardApr = reward.supplyApr || 0
      const assetSymbol = reward.asset.symbol

      // Use the symbol from API response for categorization
      const category = assetSymbol ? assetSymbol.toLowerCase() : 'other'

      // Add to appropriate category if supported, otherwise to 'other'
      if (category in rewardsByCategory) {
        rewardsByCategory[category] += rewardApr
      } else {
        rewardsByCategory.other += rewardApr
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
          const assetSymbol = reward.asset.symbol

          // Use the symbol from API response for categorization
          const category = assetSymbol ? assetSymbol.toLowerCase() : 'other'

          // Add to appropriate category if supported, otherwise to 'other'
          if (category in rewardsByCategory) {
            rewardsByCategory[category] += weightedRewardApr
          } else {
            rewardsByCategory.other += weightedRewardApr
          }
        })
      }
    })
  }

  // Calculate total rewards APR
  const totalRewards = Object.values(rewardsByCategory).reduce(
    (total, apr) => total + apr,
    0,
  )

  return {
    ...rewardsByCategory,
    totalRewards,
  } as RewardsBreakdown
}

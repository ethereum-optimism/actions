import type { AccrualPosition, IToken } from '@morpho-org/blue-sdk'
import { fetchAccrualVault } from '@morpho-org/blue-sdk-viem'
import type { Address } from 'viem'
import { baseSepolia, unichain } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import {
  fetchRewards,
  type RewardsBreakdown,
} from '@/lend/providers/morpho/api.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { getTokenAddress, SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type { ApyBreakdown, LendMarket } from '@/types/lend.js'

/**
 * Vault configuration type
 */
export interface VaultConfig {
  address: Address
  chainId: SupportedChainId
  name: string
  asset: IToken & { address: Address }
}

/**
 * Supported vaults on Unichain for Morpho lending
 */
export const SUPPORTED_VAULTS: VaultConfig[] = [
  {
    // Gauntlet USDC vault - primary supported vault
    address: '0x38f4f3B6533de0023b9DCd04b02F93d36ad1F9f9' as Address,
    chainId: unichain.id,
    name: 'Gauntlet USDC',
    asset: {
      address: getTokenAddress('USDC', 130)!, // USDC on Unichain
      symbol: SUPPORTED_TOKENS.USDC.symbol,
      decimals: BigInt(SUPPORTED_TOKENS.USDC.decimals),
      name: SUPPORTED_TOKENS.USDC.name,
    },
  },
  {
    address: '0x99067e5D73b1d6F1b5856E59209e12F5a0f86DED',
    chainId: baseSepolia.id,
    name: 'MetaMorpho USDC Vault (Base Sepolia)',
    asset: {
      address: getTokenAddress('USDC', baseSepolia.id)!,
      symbol: SUPPORTED_TOKENS.USDC.symbol,
      decimals: BigInt(SUPPORTED_TOKENS.USDC.decimals),
      name: SUPPORTED_TOKENS.USDC.name,
    },
  },
  // USDC Vault deployed on base sepolia for demo purposes that uses an erc20 with permissionless minting
  {
    address: '0x297E324C46309E93112610ebf35559685b4E3547',
    chainId: baseSepolia.id,
    name: 'USDC Demo Vault (Base Sepolia)',
    asset: {
      address: getTokenAddress('USDC_DEMO', baseSepolia.id)!,
      symbol: SUPPORTED_TOKENS.USDC_DEMO.symbol,
      decimals: BigInt(SUPPORTED_TOKENS.USDC_DEMO.decimals),
      name: SUPPORTED_TOKENS.USDC_DEMO.name,
    },
  },
]

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
      totalRewardsApr: 0,
    }

    // Add all supported tokens (lowercase) to the rewards object
    Object.keys(SUPPORTED_TOKENS).forEach((tokenSymbol) => {
      emptyRewards[tokenSymbol.toLowerCase()] = 0
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
 * Get detailed vault information with enhanced rewards data
 * @param vaultAddress - Vault address
 * @param publicClient - Viem public client
 * @returns Promise resolving to detailed vault information
 */
export async function getVaultInfo(
  vaultAddress: Address,
  chainManager: ChainManager,
): Promise<LendMarket> {
  try {
    // 1. Find vault configuration for validation
    const config = SUPPORTED_VAULTS.find((c) => c.address === vaultAddress)

    if (!config) {
      throw new Error(`Vault ${vaultAddress} not found`)
    }

    // 2. Fetch live vault data from Morpho SDK
    const vault = await fetchAccrualVault(
      vaultAddress,
      chainManager.getPublicClient(config.chainId),
    ).catch((error) => {
      console.error('Failed to fetch vault info:', error)
      return {
        totalAssets: 0n,
        totalSupply: 0n,
        owner: '0x' as Address,
        curator: '0x' as Address,
      }
    })

    // 3. Fetch rewards data from API
    const rewardsBreakdown = await fetchAndCalculateRewards(vaultAddress).catch(
      (error) => {
        console.error('Failed to fetch rewards data:', error)
        return {
          other: 0,
          totalRewardsApr: 0,
        }
      },
    )

    // 4. Calculate APY breakdown
    const apyBreakdown = calculateApyBreakdown(vault, rewardsBreakdown)

    // 7. Return comprehensive vault information
    const currentTimestampSeconds = Math.floor(Date.now() / 1000)

    return {
      chainId: config.chainId,
      address: vaultAddress,
      name: config.name,
      asset: config.asset.address,
      totalAssets: vault.totalAssets,
      totalShares: vault.totalSupply,
      apy: apyBreakdown.netApy, // Use Net APY calculation
      apyBreakdown: apyBreakdown, // Detailed breakdown
      owner: vault.owner,
      curator: vault.curator,
      fee: apyBreakdown.performanceFee,
      lastUpdate: currentTimestampSeconds,
    }
  } catch (error) {
    console.error('Failed to get vault info:', error)
    throw new Error(
      `Failed to get vault info for ${vaultAddress}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

/**
 * Get list of available markets (vaults)
 * @param chainManager - Chain manager instance
 * @returns Promise resolving to array of market information
 */
export async function getMarkets(
  chainManager: ChainManager,
): Promise<LendMarket[]> {
  try {
    const vaultInfoPromises = SUPPORTED_VAULTS.map((config) =>
      getVaultInfo(config.address, chainManager),
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
 * Find the best vault for a given asset
 * @param asset - Asset token address
 * @returns Promise resolving to vault address
 */
export async function findBestVaultForAsset(asset: Address): Promise<Address> {
  // Filter supported vaults by asset
  const assetVaults = SUPPORTED_VAULTS.filter(
    (vault) => vault.asset.address === asset,
  )

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
    baseApyBeforeFees + rewardsBreakdown.totalRewardsApr - performanceFeeImpact

  return {
    nativeApy: baseApyBeforeFees, // Native APY from market lending (before fees)
    performanceFee: performanceFee,
    netApy: netApy,
    ...rewardsBreakdown, // Spread all dynamic reward properties
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
  Object.keys(SUPPORTED_TOKENS).forEach((tokenSymbol) => {
    rewardsByCategory[tokenSymbol.toLowerCase()] = 0
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
  const totalRewardsApr = Object.values(rewardsByCategory).reduce(
    (total, apr) => total + apr,
    0,
  )

  // Return dynamic rewards breakdown
  return {
    ...rewardsByCategory,
    totalRewardsApr,
  } as RewardsBreakdown
}

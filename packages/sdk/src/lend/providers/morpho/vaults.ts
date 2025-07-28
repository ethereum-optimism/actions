import type { AccrualPosition, IToken } from '@morpho-org/blue-sdk'
import { fetchAccrualVault } from '@morpho-org/blue-sdk-viem'
import type { Address, PublicClient } from 'viem'

import {
  categorizeRewardToken,
  getTokenAddress,
  SUPPORTED_TOKENS,
} from '../../../supported/tokens.js'
import type { ApyBreakdown, LendVaultInfo } from '../../../types/lend.js'
import { fetchRewards, type RewardsBreakdown } from './api.js'

/**
 * Vault configuration type
 */
export interface VaultConfig {
  address: Address
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
    name: 'Gauntlet USDC',
    asset: {
      address: getTokenAddress('USDC', 130)!, // USDC on Unichain
      symbol: SUPPORTED_TOKENS.USDC.symbol,
      decimals: BigInt(SUPPORTED_TOKENS.USDC.decimals),
      name: SUPPORTED_TOKENS.USDC.name,
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
    return {
      usdcRewardsApr: 0,
      morphoRewardsApr: 0,
      otherRewardsApr: 0,
      totalRewardsApr: 0,
    }
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
  publicClient: PublicClient,
): Promise<LendVaultInfo> {
  try {
    // 1. Fetch vault configuration for validation
    const vaultConfigs = await fetchVaultConfigs()
    const config = vaultConfigs.find((c) => c.address === vaultAddress)

    if (!config) {
      throw new Error(`Vault ${vaultAddress} not found`)
    }

    // 2. Fetch live vault data from Morpho SDK
    const vault = await fetchAccrualVault(vaultAddress, publicClient)

    // 3. Calculate base APY from SDK data (before fees)
    const baseApyBeforeFees =
      calculateBaseApy(vault) / (1 - Number(vault.fee) / 1e18) // Reverse the fee application to get before-fees APY
    const performanceFee = Number(vault.fee) / 1e18

    // 4. Fetch rewards data from API
    const rewardsBreakdown = await fetchAndCalculateRewards(vaultAddress)

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
 * @param publicClient - Viem public client
 * @returns Promise resolving to array of vault information
 */
export async function getVaults(
  publicClient: PublicClient,
): Promise<LendVaultInfo[]> {
  try {
    const vaultConfigs = await fetchVaultConfigs()
    const vaultInfoPromises = vaultConfigs.map((config) =>
      getVaultInfo(config.address, publicClient),
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

  // For now, return the first (and likely only) supported vault for the asset
  // TODO: In the future, this could compare APYs from live vault data
  return assetVaults[0].address
}

/**
 * Fetch vault configurations from static supported vaults
 * @returns Promise resolving to array of supported vault configurations
 */
async function fetchVaultConfigs(): Promise<VaultConfig[]> {
  // Return statically configured supported vaults for Unichain
  // TODO: In the future, this could be enhanced to fetch live vault data
  // from Morpho's API or subgraph for additional validation
  return SUPPORTED_VAULTS
}

/**
 * Calculate detailed rewards breakdown from vault and market allocations
 * @param apiVault - Vault data from GraphQL API
 * @returns Detailed rewards breakdown
 */
export function calculateRewardsBreakdown(apiVault: any): RewardsBreakdown {
  let usdcRewardsApr = 0
  let morphoRewardsApr = 0
  let otherRewardsApr = 0

  // Calculate vault-level rewards
  if (apiVault.state?.rewards && apiVault.state.rewards.length > 0) {
    apiVault.state.rewards.forEach((reward: any) => {
      const rewardApr = reward.supplyApr || 0
      const assetAddress = reward.asset.address
      const chainId = reward.asset.chain?.id || 130 // Default to Unichain

      const category = categorizeRewardToken(assetAddress, chainId)
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

          const category = categorizeRewardToken(assetAddress, chainId)
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

  return {
    usdcRewardsApr,
    morphoRewardsApr,
    otherRewardsApr,
    totalRewardsApr,
  }
}

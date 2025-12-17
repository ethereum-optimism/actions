import { type AccrualPosition, ChainId } from '@morpho-org/blue-sdk'
import {
  adaptiveCurveIrmAbi,
  blueAbi,
  fetchAccrualVault,
  metaMorphoAbi,
} from '@morpho-org/blue-sdk-viem'
import type { Address, PublicClient } from 'viem'

import {
  fetchRewards,
  type RewardsBreakdown,
} from '@/lend/providers/morpho/api.js'
import { getMorphoContracts } from '@/lend/providers/morpho/contracts.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type {
  ApyBreakdown,
  LendMarket,
  LendMarketConfig,
  LendMarketId,
  MorphoContracts,
} from '@/types/lend/index.js'
import { SECONDS_PER_YEAR } from '@/utils/constants.js'

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
 * Fetch real on-chain vault data using direct contract queries
 * Used when Morpho SDK doesn't support the chain (e.g., testnets)
 * @param marketId - Market identifier
 * @param marketConfig - Market configuration from allowlist
 * @param publicClient - Viem public client for the chain
 * @param contracts - Morpho contract addresses for this chain
 * @returns Promise resolving to vault data with real on-chain APY
 */
async function fetchVaultDataOnChain(
  marketId: LendMarketId,
  marketConfig: LendMarketConfig,
  publicClient: PublicClient,
  contracts: MorphoContracts,
): Promise<LendMarket> {
  // Fetch vault basic info
  const [totalAssets, totalSupply, fee, owner, curator, supplyQueueLength] =
    await Promise.all([
      publicClient.readContract({
        address: marketId.address,
        abi: metaMorphoAbi,
        functionName: 'totalAssets',
      }),
      publicClient.readContract({
        address: marketId.address,
        abi: metaMorphoAbi,
        functionName: 'totalSupply',
      }),
      publicClient.readContract({
        address: marketId.address,
        abi: metaMorphoAbi,
        functionName: 'fee',
      }),
      publicClient.readContract({
        address: marketId.address,
        abi: metaMorphoAbi,
        functionName: 'owner',
      }),
      publicClient.readContract({
        address: marketId.address,
        abi: metaMorphoAbi,
        functionName: 'curator',
      }),
      publicClient.readContract({
        address: marketId.address,
        abi: metaMorphoAbi,
        functionName: 'supplyQueueLength',
      }),
    ])

  // Calculate weighted APY from all markets in the supply queue
  let totalWeightedApy = 0n
  let totalSupplyInMarkets = 0n

  for (let i = 0n; i < supplyQueueLength; i++) {
    const marketIdHash = await publicClient.readContract({
      address: marketId.address,
      abi: metaMorphoAbi,
      functionName: 'supplyQueue',
      args: [i],
    })

    // Get market params and state
    const [marketParams, marketState, vaultPosition] = await Promise.all([
      publicClient.readContract({
        address: contracts.morphoBlue,
        abi: blueAbi,
        functionName: 'idToMarketParams',
        args: [marketIdHash],
      }),
      publicClient.readContract({
        address: contracts.morphoBlue,
        abi: blueAbi,
        functionName: 'market',
        args: [marketIdHash],
      }),
      publicClient.readContract({
        address: contracts.morphoBlue,
        abi: blueAbi,
        functionName: 'position',
        args: [marketIdHash, marketId.address],
      }),
    ])

    const [
      supplyAssets,
      supplyShares,
      borrowAssets,
      borrowShares,
      lastUpdate,
      marketFee,
    ] = marketState
    const [vaultSupplyShares] = vaultPosition

    // Skip if vault has no position in this market
    if (vaultSupplyShares === 0n) continue

    // Calculate vault's share of supply in this market
    const vaultSupplyAssets =
      supplyShares > 0n ? (vaultSupplyShares * supplyAssets) / supplyShares : 0n

    if (vaultSupplyAssets === 0n || supplyAssets === 0n) continue

    // Get borrow rate from IRM
    const borrowRate = await publicClient.readContract({
      address: contracts.irm,
      abi: adaptiveCurveIrmAbi,
      functionName: 'borrowRateView',
      args: [
        {
          loanToken: marketParams[0],
          collateralToken: marketParams[1],
          oracle: marketParams[2],
          irm: marketParams[3],
          lltv: marketParams[4],
        },
        {
          totalSupplyAssets: supplyAssets,
          totalSupplyShares: supplyShares,
          totalBorrowAssets: borrowAssets,
          totalBorrowShares: borrowShares,
          lastUpdate: lastUpdate,
          fee: marketFee,
        },
      ],
    })

    // Calculate supply APY: borrow_rate * utilization * seconds_per_year
    // borrowRate is per-second rate in WAD (1e18)
    const utilization =
      supplyAssets > 0n ? (borrowAssets * BigInt(1e18)) / supplyAssets : 0n

    // Supply APY = borrow rate per second * utilization * seconds per year
    // Result is in WAD format (1e18 = 100%)
    const marketSupplyApy =
      (borrowRate * utilization * SECONDS_PER_YEAR) / BigInt(1e18)

    // Weighted by vault's position in this market
    totalWeightedApy += marketSupplyApy * vaultSupplyAssets
    totalSupplyInMarkets += vaultSupplyAssets
  }

  // Calculate final APY
  const performanceFee = Number(fee) / 1e18
  let nativeApy = 0
  let netApy = 0

  if (totalSupplyInMarkets > 0n) {
    const weightedApyWad = totalWeightedApy / totalSupplyInMarkets
    nativeApy = Number(weightedApyWad) / 1e18 // Convert from WAD
    netApy = nativeApy * (1 - performanceFee)
  }

  const apyBreakdown: ApyBreakdown = {
    total: netApy,
    native: nativeApy,
    totalRewards: 0, // No rewards API for direct on-chain queries
    performanceFee: performanceFee,
  }

  return {
    marketId,
    name: marketConfig.name,
    asset: marketConfig.asset,
    supply: {
      totalAssets: totalAssets,
      totalShares: totalSupply,
    },
    apy: apyBreakdown,
    metadata: {
      owner: owner,
      curator: curator,
      fee: performanceFee,
      lastUpdate: Math.floor(Date.now() / 1000),
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
  lendConfig?: LendProviderConfig
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
 * Check if chain is supported by Morpho SDK
 */
function isSdkSupportedChain(chainId: number): boolean {
  return ChainId[chainId] !== undefined
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

  const publicClient = params.chainManager.getPublicClient(
    params.marketId.chainId,
  )

  // Try SDK first for supported chains (mainnets)
  if (isSdkSupportedChain(params.marketId.chainId)) {
    try {
      const vault = await fetchAccrualVault(
        params.marketId.address,
        publicClient,
      )

      // Fetch rewards data from API
      const rewardsBreakdown = await fetchAndCalculateRewards(
        params.marketId.address,
      ).catch((error) => {
        console.error('Failed to fetch rewards data:', error)
        return { usdc: 0, morpho: 0, other: 0, totalRewards: 0 }
      })

      const apyBreakdown = calculateApyBreakdown(vault, rewardsBreakdown)
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
      console.error('SDK fetch failed, trying on-chain fallback:', error)
    }
  }

  // Fallback to direct on-chain queries for testnets or if SDK fails
  const contracts = getMorphoContracts(params.marketId.chainId)
  if (contracts) {
    return fetchVaultDataOnChain(
      params.marketId,
      marketConfig,
      publicClient,
      contracts,
    )
  }

  // No SDK support and no contracts configured
  throw new Error(
    `Chain ${params.marketId.chainId} not supported by Morpho SDK and no contracts configured`,
  )
}

interface GetVaultsParams {
  chainManager: ChainManager
  lendConfig: LendProviderConfig
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

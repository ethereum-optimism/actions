import { type AccrualPosition, ChainId, type AccrualVault } from '@morpho-org/blue-sdk'
import {
  adaptiveCurveIrmAbi,
  blueAbi,
  fetchAccrualVault,
  metaMorphoAbi,
} from '@morpho-org/blue-sdk-viem'
import type { Address, PublicClient } from 'viem'

import { NATIVELY_SUPPORTED_ASSETS } from '@/constants/assets.js'
import {
  fetchRewards,
  type RewardsBreakdown,
  type MorphoVault,
} from '@/lend/providers/morpho/api.js'
import { getMorphoContracts } from '@/lend/providers/morpho/contracts.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
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
 * @param supportedAssets - Configured assets for reward categorization
 * @param chainId - Chain ID for address lookup
 * @returns Promise resolving to rewards breakdown
 */
export async function fetchAndCalculateRewards(
  vaultAddress: Address,
  chainId: number,
  marketAsset?: Asset,
): Promise<RewardsBreakdown> {
  const vaultData = await fetchRewards(vaultAddress, chainId)

  if (!vaultData) {
    return buildEmptyRewards(chainId, marketAsset)
  }

  return calculateRewardsBreakdown(vaultData, chainId, marketAsset)
}

/**
 * Build an empty rewards object with all supported asset addresses initialized to 0
 */
function buildEmptyRewards(
  chainId: number,
  marketAsset?: Asset,
): RewardsBreakdown {
  const assets = marketAsset
    ? [...NATIVELY_SUPPORTED_ASSETS, marketAsset]
    : NATIVELY_SUPPORTED_ASSETS
  const emptyRewards: Record<string, number> = { other: 0, totalRewards: 0 }
  for (const token of assets) {
    const addr = token.address[chainId as keyof typeof token.address]
    if (addr && addr !== 'native') {
      emptyRewards[addr.toLowerCase()] = 0
    }
  }
  return emptyRewards as RewardsBreakdown
}

/**
 * Calculate rewards breakdown from vault data
 */
function calculateRewardsBreakdown(
  vaultData: MorphoVault,
  chainId: number,
  marketAsset?: Asset,
): RewardsBreakdown {
  const assets = marketAsset
    ? [...NATIVELY_SUPPORTED_ASSETS, marketAsset]
    : NATIVELY_SUPPORTED_ASSETS
  const rewardsBreakdown: Record<string, number> = {
    other: 0,
    totalRewards: 0,
  }

  // Initialize all asset addresses to 0
  for (const token of assets) {
    const addr = token.address[chainId as keyof typeof token.address]
    if (addr && addr !== 'native') {
      rewardsBreakdown[addr.toLowerCase()] = 0
    }
  }

  // Sum rewards from vault state rewards
  if (vaultData.state?.rewards && Array.isArray(vaultData.state.rewards)) {
    for (const reward of vaultData.state.rewards) {
      if (reward.supplyApr && reward.asset?.address) {
        const rewardToken = reward.asset.address.toLowerCase()
        // supplyApr is already in APR format from the API
        const supplyApr = Number(reward.supplyApr)

        if (rewardsBreakdown[rewardToken] !== undefined) {
          rewardsBreakdown[rewardToken] += supplyApr
        } else {
          rewardsBreakdown.other += supplyApr
        }
        rewardsBreakdown.totalRewards += supplyApr
      }
    }
  }

  return rewardsBreakdown as RewardsBreakdown
}

/**
 * Calculate base vault APY from SDK data
 * @param vault - Vault data from Morpho SDK
 * @returns Base APY (before rewards, after fees)
 */
export function calculateBaseApy(vault: AccrualVault): number {
  try {
    if (vault.totalAssets === 0n) {
      return 0
    }

    // Convert allocations Map to array and calculate weighted APY
    const allocationsArray = Array.from(vault.allocations.values())

    const totalWeightedApy = allocationsArray.reduce(
      (total: bigint, allocation) => {
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

    // Calculate base APY: weighted average of market APYs
    const baseApy = Number(totalWeightedApy) / Number(vault.totalAssets)

    return baseApy
  } catch (error) {
    console.error('Error calculating base APY:', error)
    return 0
  }
}

/**
 * Calculate APY breakdown from vault and rewards data
 * @param vault - Vault data from Morpho SDK
 * @param rewardsBreakdown - Rewards breakdown from API
 * @returns APY breakdown with base, rewards, and net APY
 */
export function calculateApyBreakdown(
  vault: AccrualVault,
  rewardsBreakdown: RewardsBreakdown,
): ApyBreakdown {
  const baseApy = calculateBaseApy(vault)

  // Calculate rewards APY based on vault's total assets
  // rewardsBreakdown.totalRewards is annual reward amount in reward token units
  // We need to convert to APY percentage based on vault TVL
  let rewardsApy = 0
  if (vault.totalAssets > 0n && rewardsBreakdown.totalRewards > 0) {
    // Convert total assets to a comparable unit (assuming 18 decimals for simplicity)
    // This is a simplified calculation - in production you'd use proper price feeds
    const totalAssetsNum = Number(vault.totalAssets) / 1e18
    rewardsApy = rewardsBreakdown.totalRewards / totalAssetsNum
  }

  return {
    base: baseApy,
    rewards: rewardsApy,
    net: baseApy + rewardsApy,
  }
}

/**
 * Check if chain is supported by Morpho SDK
 */
function isSdkSupportedChain(chainId: number): boolean {
  // Morpho SDK supports mainnet (1), base (8453), and other L2s
  return chainId === 1 || chainId === 8453 || chainId === 42161
}

/**
 * Morpho SDK-based provider for fetching vault data
 */
export class MorphoSdkProvider {
  private chainManager: ChainManager
  private configs: Map<string, LendMarketConfig> = new Map()
  private contracts: MorphoContracts | null = null

  constructor(chainManager: ChainManager) {
    this.chainManager = chainManager
  }

  /**
   * Initialize the provider with configuration
   */
  async initialize(config: LendProviderConfig): Promise<void> {
    // Store market configurations
    for (const marketConfig of config.markets) {
      const key = this.getMarketKey(marketConfig.marketId)
      this.configs.set(key, marketConfig)
    }
  }

  /**
   * Get market data using Morpho SDK
   */
  async getMarket(params: {
    marketId: LendMarketId
  }): Promise<LendMarket | null> {
    const marketConfig = this.configs.get(this.getMarketKey(params.marketId))
    if (!marketConfig) {
      console.error(`No config found for market: ${params.marketId.address}`)
      return null
    }

    // Get public client for the chain
    const publicClient = this.chainManager.getPublicClient(
      params.marketId.chainId,
    )

    // Use SDK for supported chains, fallback to contract calls for others
    if (isSdkSupportedChain(params.marketId.chainId)) {
      try {
        const vault = await fetchAccrualVault(
          params.marketId.address,
          publicClient,
        )

        // Fetch rewards data from API
        const rewardsBreakdown = await fetchAndCalculateRewards(
          params.marketId.address,
          params.marketId.chainId,
          marketConfig.asset,
        ).catch((error) => {
          console.error('Failed to fetch rewards data:', error)
          return buildEmptyRewards(params.marketId.chainId, marketConfig.asset)
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
            guardian: vault.guardian,
            fee: Number(vault.fee) / 1e18, // Convert from 18 decimals
            feeRecipient: vault.feeRecipient,
            timelock: Number(vault.timelock),
            supplyQueue: vault.supplyQueue,
            withdrawQueue: vault.withdrawQueue,
          },
          rewards: rewardsBreakdown,
          updatedAt: currentTimestampSeconds,
        }
      } catch (error) {
        console.error('SDK fetch failed, falling back to contract calls:', error)
        // Fall through to contract-based fetching
      }
    }

    // Fallback: use direct contract calls
    return this.getMarketFromContracts(params, marketConfig, publicClient)
  }

  /**
   * Fallback method using direct contract calls
   */
  private async getMarketFromContracts(
    params: { marketId: LendMarketId },
    marketConfig: LendMarketConfig,
    publicClient: PublicClient,
  ): Promise<LendMarket | null> {
    try {
      if (!this.contracts) {
        this.contracts = getMorphoContracts(publicClient)
      }

      const currentTimestampSeconds = Math.floor(Date.now() / 1000)

      // Fetch basic vault data from contract
      const [
        totalAssets,
        totalSupply,
        owner,
        curator,
        guardian,
        fee,
        feeRecipient,
        timelock,
      ] = await Promise.all([
        publicClient.readContract({
          address: params.marketId.address,
          abi: metaMorphoAbi,
          functionName: 'totalAssets',
        }),
        publicClient.readContract({
          address: params.marketId.address,
          abi: metaMorphoAbi,
          functionName: 'totalSupply',
        }),
        publicClient.readContract({
          address: params.marketId.address,
          abi: metaMorphoAbi,
          functionName: 'owner',
        }),
        publicClient.readContract({
          address: params.marketId.address,
          abi: metaMorphoAbi,
          functionName: 'curator',
        }),
        publicClient.readContract({
          address: params.marketId.address,
          abi: metaMorphoAbi,
          functionName: 'guardian',
        }),
        publicClient.readContract({
          address: params.marketId.address,
          abi: metaMorphoAbi,
          functionName: 'fee',
        }),
        publicClient.readContract({
          address: params.marketId.address,
          abi: metaMorphoAbi,
          functionName: 'feeRecipient',
        }),
        publicClient.readContract({
          address: params.marketId.address,
          abi: metaMorphoAbi,
          functionName: 'timelock',
        }),
      ])

      // Fetch rewards data from API
      const rewardsBreakdown = await fetchAndCalculateRewards(
        params.marketId.address,
        params.marketId.chainId,
        marketConfig.asset,
      ).catch((error) => {
        console.error('Failed to fetch rewards data:', error)
        return buildEmptyRewards(params.marketId.chainId, marketConfig.asset)
      })

      return {
        marketId: params.marketId,
        name: marketConfig.name,
        asset: marketConfig.asset,
        supply: {
          totalAssets,
          totalShares: totalSupply,
        },
        apy: {
          base: 0, // Would need to calculate from market data
          rewards: 0,
          net: 0,
        },
        metadata: {
          owner,
          curator,
          guardian,
          fee: Number(fee) / 1e18,
          feeRecipient,
          timelock: Number(timelock),
        },
        rewards: rewardsBreakdown,
        updatedAt: currentTimestampSeconds,
      }
    } catch (error) {
      console.error('Error fetching market data from contracts:', error)
      return null
    }
  }

  /**
   * Get all configured markets
   */
  async getMarkets(): Promise<LendMarket[]> {
    const markets: LendMarket[] = []

    for (const [, config] of this.configs) {
      const market = await this.getMarket({ marketId: config.marketId })
      if (market) {
        markets.push(market)
      }
    }

    return markets
  }

  /**
   * Generate a unique key for a market
   */
  private getMarketKey(marketId: LendMarketId): string {
    return `${marketId.chainId}-${marketId.address.toLowerCase()}`
  }
}

// Export factory function for consistency with other providers
export async function createMorphoSdkProvider(
  chainManager: ChainManager,
  config: LendProviderConfig,
): Promise<MorphoSdkProvider> {
  const provider = new MorphoSdkProvider(chainManager)
  await provider.initialize(config)
  return provider
}

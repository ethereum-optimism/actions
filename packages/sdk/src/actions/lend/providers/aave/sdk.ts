import { UiPoolDataProvider } from '@aave/contract-helpers'
import { formatReserves } from '@aave/math-utils'
import { providers } from 'ethers'
import type { Address } from 'viem'

import { POOL_GET_RESERVE_DATA_ABI } from '@/actions/lend/providers/aave/abis/pool.js'
import {
  getAaveAddresses,
  getPoolAddress,
} from '@/actions/lend/providers/aave/addresses.js'
import { WETH } from '@/constants/assets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type {
  ApyBreakdown,
  LendMarket,
  LendMarketConfig,
  LendMarketId,
} from '@/types/lend/index.js'
import { getAssetAddress } from '@/utils/assets.js'

/**
 * Parameters for getReserve function
 */
interface GetReserveParams {
  /** Market identifier (asset address and chainId) */
  marketId: LendMarketId
  /** Chain manager instance */
  chainManager: ChainManager
  /** Lend configuration containing market allowlist */
  lendConfig?: LendProviderConfig
}

/**
 * Parameters for getReserves function
 */
interface GetReservesParams {
  chainManager: ChainManager
  lendConfig: LendProviderConfig
  markets: LendMarketConfig[]
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
 * Calculate APY breakdown from reserve data
 * @param reserve - Formatted reserve data from Aave
 * @returns APY breakdown with native APY and rewards
 */
export function calculateApyBreakdown(reserve: {
  formattedReserve?: any
}): ApyBreakdown {
  // Get supply APY from formatted reserve data
  const supplyApy = reserve.formattedReserve?.supplyAPY
    ? parseFloat(reserve.formattedReserve.supplyAPY)
    : 0

  // Aave doesn't have vault-style performance fees
  // Total APY = Supply APY + any rewards (to be added later)
  return {
    total: supplyApy,
    native: supplyApy,
    totalRewards: 0, // TODO: Fetch from incentives data provider if needed
    performanceFee: 0, // Aave doesn't have performance fees
  }
}

/**
 * Get detailed reserve (market) information from Aave
 * @param params - Named parameters object
 * @returns Promise resolving to detailed market information
 */
export async function getReserve(
  params: GetReserveParams,
): Promise<LendMarket> {
  // Find market configuration in allowlist for metadata
  const marketConfig = params.lendConfig?.marketAllowlist
    ? findMarketInAllowlist(params.lendConfig.marketAllowlist, params.marketId)
    : undefined

  if (!marketConfig) {
    throw new Error(
      `Market ${params.marketId.address} on chain ${params.marketId.chainId} not found in allowlist`,
    )
  }

  const addresses = getAaveAddresses(params.marketId.chainId)
  if (!addresses) {
    throw new Error(`Aave V3 not deployed on chain ${params.marketId.chainId}`)
  }

  const poolAddress = addresses.pool
  const uiPoolDataProviderAddress = addresses.uiPoolDataProvider
  const poolAddressesProvider = addresses.poolAddressesProvider

  try {
    // Get viem public client for this chain
    const publicClient = params.chainManager.getPublicClient(
      params.marketId.chainId,
    )

    // Create ethers provider from viem's RPC URL
    // Aave SDK requires ethers provider, not viem
    const rpcUrl =
      publicClient.chain?.rpcUrls.default.http[0] ||
      publicClient.chain?.rpcUrls.public?.http[0]
    if (!rpcUrl) {
      throw new Error(
        `No RPC URL available for chain ${params.marketId.chainId}`,
      )
    }
    const ethersProvider = new providers.JsonRpcProvider(rpcUrl)

    // Create UiPoolDataProvider instance
    const uiPoolDataProvider = new UiPoolDataProvider({
      uiPoolDataProviderAddress,
      provider: ethersProvider,
      chainId: params.marketId.chainId,
    })

    // Fetch reserve data
    const reservesData = await uiPoolDataProvider.getReservesHumanized({
      lendingPoolAddressProvider: poolAddressesProvider,
    })

    // Find the specific reserve for this asset
    // For native ETH assets, use WETH address since Aave uses WETH internally
    const assetAddress =
      marketConfig.asset.type === 'native'
        ? getAssetAddress(WETH, params.marketId.chainId)
        : getAssetAddress(marketConfig.asset, params.marketId.chainId)

    const reserve = reservesData.reservesData.find(
      (r) => r.underlyingAsset.toLowerCase() === assetAddress.toLowerCase(),
    )

    if (!reserve) {
      throw new Error(
        `Reserve not found for asset ${assetAddress} on chain ${params.marketId.chainId}`,
      )
    }

    // Format reserves using Aave math-utils
    const currentTimestamp = Math.floor(Date.now() / 1000)
    const formattedReserves = formatReserves({
      reserves: [reserve],
      currentTimestamp,
      marketReferenceCurrencyDecimals:
        reservesData.baseCurrencyData.marketReferenceCurrencyDecimals,
      marketReferencePriceInUsd:
        reservesData.baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    })

    const formattedReserve = formattedReserves[0]

    // Calculate APY breakdown
    const apy = calculateApyBreakdown({
      ...reserve,
      formattedReserve,
    })

    // Return market information in our standard format
    return {
      marketId: params.marketId,
      name: marketConfig.name,
      asset: marketConfig.asset,
      supply: {
        totalAssets: BigInt(reserve.availableLiquidity),
        totalShares: BigInt(reserve.totalScaledVariableDebt || '0'),
      },
      apy,
      metadata: {
        owner: poolAddress, // Use Pool as owner
        curator: poolAddress, // No curator in Aave
        fee: 0, // No performance fee in Aave
        lastUpdate: currentTimestamp,
      },
    }
  } catch (error) {
    throw new Error(
      `Failed to get reserve info for ${params.marketId.address}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

/**
 * Get multiple reserves (markets)
 * @param params - Parameters including markets to fetch
 * @returns Promise resolving to array of market information
 */
export async function getReserves(
  params: GetReservesParams,
): Promise<LendMarket[]> {
  try {
    const reservePromises = params.markets.map((marketConfig) => {
      return getReserve({
        marketId: {
          address: marketConfig.address,
          chainId: marketConfig.chainId,
        },
        chainManager: params.chainManager,
        lendConfig: params.lendConfig,
      })
    })

    return await Promise.all(reservePromises)
  } catch (error) {
    throw new Error(
      `Failed to get reserves: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

/**
 * Get aToken address for a given underlying asset
 * @param params - Parameters including asset address, chain ID, and chain manager
 * @returns Promise resolving to aToken address
 * @description Queries the Aave Pool to get the aToken address for the underlying asset
 */
export async function getATokenAddress(params: {
  underlyingAsset: Address
  chainId: SupportedChainId
  chainManager: ChainManager
}): Promise<Address> {
  const poolAddress = getPoolAddress(params.chainId)
  if (!poolAddress) {
    throw new Error(`Aave V3 not deployed on chain ${params.chainId}`)
  }

  try {
    // Get viem public client for this chain
    const publicClient = params.chainManager.getPublicClient(params.chainId)

    // Query the Pool contract directly for reserve data
    const reserveData = await publicClient.readContract({
      address: poolAddress,
      abi: POOL_GET_RESERVE_DATA_ABI,
      functionName: 'getReserveData',
      args: [params.underlyingAsset],
    })

    // The return is a tuple where index 8 is aTokenAddress
    const aTokenAddress = reserveData[8]

    if (
      !aTokenAddress ||
      aTokenAddress === '0x0000000000000000000000000000000000000000'
    ) {
      throw new Error(
        `No aToken found for asset ${params.underlyingAsset} on chain ${params.chainId}`,
      )
    }

    return aTokenAddress
  } catch (error) {
    throw new Error(
      `Failed to get aToken address for ${params.underlyingAsset}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
    )
  }
}

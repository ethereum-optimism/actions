import { UiPoolDataProvider } from '@aave/contract-helpers'
import { formatReserves } from '@aave/math-utils'
import { providers } from 'ethers'
import type { Address } from 'viem'

import { getPoolAddress } from '@/lend/providers/aave/addresses.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type {
  ApyBreakdown,
  LendConfig,
  LendMarket,
  LendMarketConfig,
  LendMarketId,
} from '@/types/lend/index.js'
import { getAssetAddress } from '@/utils/assets.js'

/**
 * UI Pool Data Provider addresses for each chain
 * @description Contract addresses for UiPoolDataProvider on each supported chain
 */
const UI_POOL_DATA_PROVIDER_ADDRESSES: Record<number, Address> = {
  // Optimism Mainnet
  10: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
  // Base Mainnet
  8453: '0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad',
  // Optimism Sepolia
  11155420: '0x86E2938daE289763D4e09a7e42c5cCcA62Cf9809',
  // Base Sepolia
  84532: '0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b',
} as const

/**
 * Pool Addresses Provider addresses for each chain
 */
const POOL_ADDRESSES_PROVIDER: Record<number, Address> = {
  // Optimism Mainnet
  10: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
  // Base Mainnet
  8453: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
  // Optimism Sepolia
  11155420: '0x36616cf17557639614c1cdDb356b1B83fc0B2132',
  // Base Sepolia
  84532: '0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00',
} as const

/**
 * Parameters for getReserve function
 */
interface GetReserveParams {
  /** Market identifier (asset address and chainId) */
  marketId: LendMarketId
  /** Chain manager instance */
  chainManager: ChainManager
  /** Lend configuration containing market allowlist */
  lendConfig?: LendConfig
}

/**
 * Parameters for getReserves function
 */
interface GetReservesParams {
  chainManager: ChainManager
  lendConfig: LendConfig
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

  const poolAddress = getPoolAddress(params.marketId.chainId)
  if (!poolAddress) {
    throw new Error(`Aave V3 not deployed on chain ${params.marketId.chainId}`)
  }

  const uiPoolDataProviderAddress =
    UI_POOL_DATA_PROVIDER_ADDRESSES[params.marketId.chainId]
  const poolAddressesProvider = POOL_ADDRESSES_PROVIDER[params.marketId.chainId]

  if (!uiPoolDataProviderAddress || !poolAddressesProvider) {
    throw new Error(
      `UiPoolDataProvider not configured for chain ${params.marketId.chainId}`,
    )
  }

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
    const assetAddress = getAssetAddress(
      marketConfig.asset,
      params.marketId.chainId,
    )

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

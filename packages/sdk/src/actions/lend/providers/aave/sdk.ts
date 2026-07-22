import { type Address, formatUnits } from 'viem'

import { findMarketInAllowlist } from '@/actions/lend/utils/markets.js'
import { requireAavePoolAddress } from '@/actions/shared/aave/addresses.js'
import { readAaveReserveData } from '@/actions/shared/aave/reserve.js'
import { WETH } from '@/constants/assets.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { MarketNotAllowedError } from '@/core/error/errors.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import type {
  ApyBreakdown,
  LendMarket,
  LendMarketConfig,
  LendMarketId,
} from '@/types/lend/index.js'
import { getAssetAddress, isNativeAsset } from '@/utils/assets.js'
import { SECONDS_PER_YEAR } from '@/utils/constants.js'
import { validateNotZeroAddress } from '@/utils/validation.js'

import {
  type AaveLendReserveState,
  fetchAaveLendReserveState,
} from './state.js'

const SECONDS_PER_YEAR_NUMBER = Number(SECONDS_PER_YEAR)

interface GetReserveParams {
  marketId: LendMarketId
  chainManager: ChainManager
  lendConfig?: LendProviderConfig
}

interface GetReservesParams {
  chainManager: ChainManager
  lendConfig: LendProviderConfig
  markets: LendMarketConfig[]
}

interface BuildMarketParams {
  marketId: LendMarketId
  config: LendMarketConfig
  pool: Address
  state: AaveLendReserveState
}

function requireMarketConfig(params: GetReserveParams): LendMarketConfig {
  const config = findMarketInAllowlist(
    params.lendConfig?.marketAllowlist,
    params.marketId,
  )
  if (config) return config
  throw new MarketNotAllowedError({
    address: params.marketId.address,
    chainId: params.marketId.chainId,
    reason: 'Market not found in allowlist',
  })
}

function resolveReserveAsset(config: LendMarketConfig): Address {
  return isNativeAsset(config.asset)
    ? getAssetAddress(WETH, config.chainId)
    : getAssetAddress(config.asset, config.chainId)
}

/**
 * @description Converts an Aave liquidity rate from ray units to compounded APY.
 * @param liquidityRateRay - Annualized supply rate scaled by 1e27.
 * @returns Native, reward, fee, and total APY components as decimal fractions.
 */
export function calculateApyBreakdown(liquidityRateRay: bigint): ApyBreakdown {
  const annualRate = Number(formatUnits(liquidityRateRay, 27))
  const supplyApy = Math.expm1(
    SECONDS_PER_YEAR_NUMBER * Math.log1p(annualRate / SECONDS_PER_YEAR_NUMBER),
  )
  return {
    total: supplyApy,
    native: supplyApy,
    totalRewards: 0,
    performanceFee: 0,
  }
}

function buildMarket(params: BuildMarketParams): LendMarket {
  const lastUpdate = Math.floor(Date.now() / 1000)
  return {
    marketId: params.marketId,
    name: params.config.name,
    asset: params.config.asset,
    supply: {
      totalAssets: params.state.availableLiquidity,
      totalShares: params.state.totalSupply,
    },
    apy: calculateApyBreakdown(params.state.liquidityRateRay),
    metadata: {
      owner: params.pool,
      curator: params.pool,
      fee: 0,
      lastUpdate,
    },
  }
}

/**
 * @description Gets one configured Aave lend market from onchain reserve state.
 * @param params - Market identifier, chain manager, and lend configuration.
 * @returns Detailed market liquidity, shares, APY, and metadata.
 * @throws MarketNotAllowedError when the market is absent from the allowlist.
 * @throws ChainNotSupportedError when Aave is not configured for the chain.
 */
export async function getReserve(
  params: GetReserveParams,
): Promise<LendMarket> {
  const config = requireMarketConfig(params)
  const pool = requireAavePoolAddress(params.marketId.chainId)
  const asset = resolveReserveAsset(config)
  const client = params.chainManager.getPublicClient(params.marketId.chainId)
  const state = await fetchAaveLendReserveState(client, pool, asset)
  return buildMarket({ marketId: params.marketId, config, pool, state })
}

/**
 * @description Gets all configured Aave lend markets concurrently.
 * @param params - Markets, chain manager, and lend configuration.
 * @returns Detailed market information in input order.
 * @throws MarketNotAllowedError when a market is absent from the allowlist.
 * @throws ChainNotSupportedError when Aave is not configured for a chain.
 */
export async function getReserves(
  params: GetReservesParams,
): Promise<LendMarket[]> {
  return Promise.all(
    params.markets.map((market) =>
      getReserve({
        marketId: { address: market.address, chainId: market.chainId },
        chainManager: params.chainManager,
        lendConfig: params.lendConfig,
      }),
    ),
  )
}

/**
 * @description Resolves an Aave reserve's aToken directly from the Pool.
 * @param params - Underlying asset, chain ID, and chain manager.
 * @returns The interest-bearing aToken address.
 * @throws ChainNotSupportedError when Aave is not configured for the chain.
 * @throws ZeroAddressError when the Pool has no reserve for the asset.
 */
export async function getATokenAddress(params: {
  underlyingAsset: Address
  chainId: SupportedChainId
  chainManager: ChainManager
}): Promise<Address> {
  const pool = requireAavePoolAddress(params.chainId)
  const client = params.chainManager.getPublicClient(params.chainId)
  const reserve = await readAaveReserveData(
    client,
    pool,
    params.underlyingAsset,
  )
  validateNotZeroAddress(reserve.aToken, 'Aave aToken')
  return reserve.aToken
}

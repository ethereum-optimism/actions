import {
  type Address,
  type ContractFunctionReturnType,
  erc20Abi,
  type PublicClient,
} from 'viem'

import {
  ADDRESSES_PROVIDER_ABI,
  ORACLE_ABI,
  POOL_ACCOUNT_ABI,
  POOL_GET_RESERVE_DATA_ABI,
} from '@/actions/shared/aave/abis/pool.js'
import {
  getAaveAddresses,
  requireAavePoolAddress,
} from '@/actions/shared/aave/addresses.js'
import { ChainNotSupportedError } from '@/core/error/errors.js'
import type { AaveBorrowMarketConfig } from '@/types/borrow/index.js'

import type {
  AaveMarketState,
  AavePositionState,
  AaveReservePrices,
} from './presentation.js'

/**
 * Decode the packed Aave reserve `configuration.data` bitmap.
 * @description Bits 0-15 LTV, 16-31 liquidation threshold, 32-47 liquidation
 * bonus, 48-55 decimals; all in basis points except decimals.
 * https://github.com/aave/aave-v3-core/blob/master/contracts/protocol/libraries/configuration/ReserveConfiguration.sol
 */
export function decodeReserveConfig(data: bigint): {
  ltvBps: bigint
  liquidationThresholdBps: bigint
  liquidationBonusBps: bigint
  decimals: number
} {
  return {
    ltvBps: data & 0xffffn,
    liquidationThresholdBps: (data >> 16n) & 0xffffn,
    liquidationBonusBps: (data >> 32n) & 0xffffn,
    decimals: Number((data >> 48n) & 0xffn),
  }
}

type RawReserveData = ContractFunctionReturnType<
  typeof POOL_GET_RESERVE_DATA_ABI,
  'view',
  'getReserveData'
>

interface DecodedReserveData {
  configData: bigint
  variableBorrowRateRay: bigint
  aToken: Address
  variableDebtToken: Address
}

/**
 * `getReserveData` returns a flat tuple. Pull out the fields the borrow
 * provider needs by their documented positions: configuration bitmap (0),
 * variable borrow rate (4), aToken address (8), variable debt token (10).
 * Positions follow the `ReserveData` struct field order:
 * https://github.com/aave/aave-v3-core/blob/master/contracts/protocol/libraries/types/DataTypes.sol
 */
function decodeReserveData(reserve: RawReserveData): DecodedReserveData {
  return {
    configData: reserve[0].data,
    variableBorrowRateRay: reserve[4],
    aToken: reserve[8],
    variableDebtToken: reserve[10],
  }
}

/** A `getReserveData(asset)` multicall contract spec against the pool. */
function reserveDataCall(pool: Address, asset: Address) {
  return {
    address: pool,
    abi: POOL_GET_RESERVE_DATA_ABI,
    functionName: 'getReserveData',
    args: [asset],
  } as const
}

/**
 * Read and decode both the debt and collateral reserves' `getReserveData`
 * in one multicall. Shared by the reserve-only read paths; the position
 * read inlines the same two calls so it can batch `getUserAccountData`.
 */
async function readBothReserveData(
  client: PublicClient,
  pool: Address,
  config: AaveBorrowMarketConfig,
): Promise<{ debt: DecodedReserveData; collateral: DecodedReserveData }> {
  const [debtRaw, collateralRaw] = await client.multicall({
    allowFailure: false,
    contracts: [
      reserveDataCall(pool, config.aave.debtReserve),
      reserveDataCall(pool, config.aave.collateralReserve),
    ],
  })
  return {
    debt: decodeReserveData(debtRaw),
    collateral: decodeReserveData(collateralRaw),
  }
}

/**
 * Read reserve-level state for an Aave borrow market in one multicall:
 * the debt reserve's variable borrow rate and total debt, and the
 * collateral reserve's configuration (liquidation threshold / bonus) and
 * total supply (aToken `totalSupply`).
 */
export async function fetchAaveMarketState(
  client: PublicClient,
  config: AaveBorrowMarketConfig,
): Promise<AaveMarketState> {
  const pool = requireAavePoolAddress(config.chainId)
  const { debt: debtReserve, collateral: collateralReserve } =
    await readBothReserveData(client, pool, config)
  const collateralConfig = decodeReserveConfig(collateralReserve.configData)

  const [totalBorrowed, totalCollateral] = await client.multicall({
    allowFailure: false,
    contracts: [
      {
        address: debtReserve.variableDebtToken,
        abi: erc20Abi,
        functionName: 'totalSupply',
      },
      {
        address: collateralReserve.aToken,
        abi: erc20Abi,
        functionName: 'totalSupply',
      },
    ],
  })

  return {
    variableBorrowRateRay: debtReserve.variableBorrowRateRay,
    liquidationThresholdBps: collateralConfig.liquidationThresholdBps,
    liquidationBonusBps: collateralConfig.liquidationBonusBps,
    totalBorrowed,
    totalCollateral,
  }
}

/**
 * Read a wallet's position in the synthetic pair. Reads the specific reserve
 * token balances (collateral aToken, debt variable-debt token) rather than the
 * aggregate, so an unrelated Aave position on the same wallet does not corrupt
 * the displayed pair. `getUserAccountData` supplies the protocol-computed
 * health factor and the rate snapshot comes from the debt reserve.
 */
export async function fetchAavePositionState(
  client: PublicClient,
  config: AaveBorrowMarketConfig,
  user: Address,
): Promise<AavePositionState> {
  const pool = requireAavePoolAddress(config.chainId)
  const [debtReserveRaw, collateralReserveRaw, accountData] =
    await client.multicall({
      allowFailure: false,
      contracts: [
        reserveDataCall(pool, config.aave.debtReserve),
        reserveDataCall(pool, config.aave.collateralReserve),
        {
          address: pool,
          abi: POOL_ACCOUNT_ABI,
          functionName: 'getUserAccountData',
          args: [user],
        },
      ],
    })

  const debtReserve = decodeReserveData(debtReserveRaw)
  const collateralReserve = decodeReserveData(collateralReserveRaw)
  const collateralConfig = decodeReserveConfig(collateralReserve.configData)

  const [collateralAmount, debtAmount] = await client.multicall({
    allowFailure: false,
    contracts: [
      {
        address: collateralReserve.aToken,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [user],
      },
      {
        address: debtReserve.variableDebtToken,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [user],
      },
    ],
  })

  const [, totalDebtBase, , currentLiquidationThreshold, , healthFactor] =
    accountData

  return {
    collateralAmount,
    debtAmount,
    healthFactorWad: healthFactor,
    // Prefer the collateral reserve's configured threshold; the aggregate
    // account threshold is a fallback when the reserve read is zeroed.
    liquidationThresholdBps:
      collateralConfig.liquidationThresholdBps > 0n
        ? collateralConfig.liquidationThresholdBps
        : currentLiquidationThreshold,
    liquidationBonusBps: collateralConfig.liquidationBonusBps,
    variableBorrowRateRay: debtReserve.variableBorrowRateRay,
    totalCollateralBase: accountData[0],
    totalDebtBase,
  }
}

/** Resolve the aToken / variable-debt-token addresses for the configured pair. */
export async function fetchAaveReserveTokens(
  client: PublicClient,
  config: AaveBorrowMarketConfig,
): Promise<{ aToken: Address; variableDebtToken: Address }> {
  const pool = requireAavePoolAddress(config.chainId)
  const { debt, collateral } = await readBothReserveData(client, pool, config)
  return {
    aToken: collateral.aToken,
    variableDebtToken: debt.variableDebtToken,
  }
}

/**
 * Read base-currency (USD) oracle prices for the collateral and debt reserves.
 * Resolves the oracle via the pool addresses provider, then reads both prices.
 * Used by the write path to project the resulting position's health factor.
 */
async function fetchAavePrices(
  client: PublicClient,
  config: AaveBorrowMarketConfig,
): Promise<AaveReservePrices> {
  const addresses = getAaveAddresses(config.chainId)
  if (!addresses) throw new ChainNotSupportedError({ chainId: config.chainId })

  const oracle = await client.readContract({
    address: addresses.poolAddressesProvider,
    abi: ADDRESSES_PROVIDER_ABI,
    functionName: 'getPriceOracle',
  })

  const [collateralPrice, debtPrice] = await client.multicall({
    allowFailure: false,
    contracts: [
      {
        address: oracle,
        abi: ORACLE_ABI,
        functionName: 'getAssetPrice',
        args: [config.aave.collateralReserve],
      },
      {
        address: oracle,
        abi: ORACLE_ABI,
        functionName: 'getAssetPrice',
        args: [config.aave.debtReserve],
      },
    ],
  })

  return { collateralPrice, debtPrice }
}

/**
 * Read the caller's position and the reserve prices in parallel. Both feed
 * `projectAavePositionState`, so every write path fetches them together.
 */
export async function fetchAaveStateAndPrices(
  client: PublicClient,
  config: AaveBorrowMarketConfig,
  user: Address,
): Promise<{ current: AavePositionState; prices: AaveReservePrices }> {
  const [current, prices] = await Promise.all([
    fetchAavePositionState(client, config, user),
    fetchAavePrices(client, config),
  ])
  return { current, prices }
}

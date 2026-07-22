import type { Address, ContractFunctionReturnType, PublicClient } from 'viem'

import { POOL_GET_RESERVE_DATA_ABI } from './abis/pool.js'

type RawAaveReserveData = ContractFunctionReturnType<
  typeof POOL_GET_RESERVE_DATA_ABI,
  'view',
  'getReserveData'
>

/** Decoded Aave reserve fields shared by lend and borrow providers. */
export interface DecodedAaveReserveData {
  /** Packed reserve configuration bitmap. */
  configData: bigint
  /** Current supply rate in ray units. */
  liquidityRateRay: bigint
  /** Current variable borrow rate in ray units. */
  variableBorrowRateRay: bigint
  /** Interest-bearing token address. */
  aToken: Address
  /** Variable debt token address. */
  variableDebtToken: Address
}

/**
 * @description Decodes the shared fields from an Aave Pool reserve tuple.
 * @param reserve - Raw `getReserveData` return value.
 * @returns Reserve configuration, rates, and token addresses.
 */
export function decodeAaveReserveData(
  reserve: RawAaveReserveData,
): DecodedAaveReserveData {
  return {
    configData: reserve[0].data,
    liquidityRateRay: reserve[2],
    variableBorrowRateRay: reserve[4],
    aToken: reserve[8],
    variableDebtToken: reserve[10],
  }
}

/**
 * @description Builds a typed Aave Pool `getReserveData` contract call.
 * @param pool - Aave Pool address.
 * @param asset - Underlying reserve asset address.
 * @returns A viem contract-call descriptor.
 */
export function aaveReserveDataCall(pool: Address, asset: Address) {
  return {
    address: pool,
    abi: POOL_GET_RESERVE_DATA_ABI,
    functionName: 'getReserveData',
    args: [asset],
  } as const
}

/**
 * @description Reads and decodes one reserve directly from the Aave Pool.
 * @param client - Public client for the reserve chain.
 * @param pool - Aave Pool address.
 * @param asset - Underlying reserve asset address.
 * @returns Decoded reserve configuration, rates, and token addresses.
 * @throws A viem contract error when the Pool read fails.
 */
export async function readAaveReserveData(
  client: PublicClient,
  pool: Address,
  asset: Address,
): Promise<DecodedAaveReserveData> {
  const reserve = await client.readContract(aaveReserveDataCall(pool, asset))
  return decodeAaveReserveData(reserve)
}

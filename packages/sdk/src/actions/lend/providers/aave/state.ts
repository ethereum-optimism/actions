import { type Address, erc20Abi, type PublicClient } from 'viem'

import { readAaveReserveData } from '@/actions/shared/aave/reserve.js'

/** Aave reserve state needed by the lend market presentation. */
export interface AaveLendReserveState {
  /** Underlying liquidity currently held by the aToken contract. */
  availableLiquidity: bigint
  /** Total issued aToken shares. */
  totalSupply: bigint
  /** Current supply rate in ray units. */
  liquidityRateRay: bigint
}

/**
 * @description Reads one Aave reserve through Pool and ERC-20 calls.
 * @param client - Public client for the reserve chain.
 * @param pool - Aave Pool address.
 * @param asset - Underlying reserve asset address.
 * @returns Liquidity, share supply, and supply rate.
 * @throws A viem contract error when a reserve or token read fails.
 */
export async function fetchAaveLendReserveState(
  client: PublicClient,
  pool: Address,
  asset: Address,
): Promise<AaveLendReserveState> {
  const reserve = await readAaveReserveData(client, pool, asset)
  const [availableLiquidity, totalSupply] = await client.multicall({
    allowFailure: false,
    contracts: [
      {
        address: asset,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [reserve.aToken],
      },
      {
        address: reserve.aToken,
        abi: erc20Abi,
        functionName: 'totalSupply',
      },
    ],
  })
  return {
    availableLiquidity,
    totalSupply,
    liquidityRateRay: reserve.liquidityRateRay,
  }
}

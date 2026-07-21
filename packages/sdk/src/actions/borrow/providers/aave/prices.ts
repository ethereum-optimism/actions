import type { Address, PublicClient } from 'viem'

import {
  ADDRESSES_PROVIDER_ABI,
  ORACLE_ABI,
} from '@/actions/shared/aave/abis/pool.js'
import { getAaveAddresses } from '@/actions/shared/aave/addresses.js'
import { ChainNotSupportedError } from '@/core/error/errors.js'
import type { AaveBorrowMarketConfig } from '@/types/borrow/index.js'

import type { AavePositionState, AaveReservePrices } from './presentation.js'
import { fetchAavePositionState } from './state.js'

/**
 * @description Reads base-currency oracle prices for both configured reserves.
 * @param client - Public client for the market chain.
 * @param config - Aave borrow market configuration.
 * @returns Collateral and debt prices in the pool's base currency.
 * @throws ChainNotSupportedError when Aave is not configured for the chain.
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
 * @description Reads a wallet position and both reserve prices concurrently.
 * @param client - Public client for the market chain.
 * @param config - Aave borrow market configuration.
 * @param user - Wallet whose position should be read.
 * @returns Current position state and reserve prices.
 * @throws A viem contract error when a position or oracle read fails.
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

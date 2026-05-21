import { AccrualPosition, type Market } from '@morpho-org/blue-sdk'
import { blueAbi, blueOracleAbi } from '@morpho-org/blue-sdk-viem'
import { type Address, erc20Abi, type PublicClient } from 'viem'

import {
  buildMorphoMarket,
  requireMorphoBlueAddress,
} from '@/actions/borrow/providers/morpho/blue.js'
import type { BorrowMarketConfig } from '@/types/borrow/index.js'

export async function fetchMorphoMarket(
  client: PublicClient,
  config: BorrowMarketConfig,
): Promise<Market> {
  const morphoBlue = requireMorphoBlueAddress(config.chainId)
  const id = config.marketId
  const [marketTuple, price] = await client.multicall({
    allowFailure: false,
    contracts: [
      {
        address: morphoBlue,
        abi: blueAbi,
        functionName: 'market',
        args: [id],
      },
      {
        address: config.marketParams.oracle,
        abi: blueOracleAbi,
        functionName: 'price',
        args: [],
      },
    ],
  })

  return buildMorphoMarket(config, marketTuple, price)
}

export async function fetchMorphoPosition(
  client: PublicClient,
  config: BorrowMarketConfig,
  user: Address,
): Promise<AccrualPosition> {
  const morphoBlue = requireMorphoBlueAddress(config.chainId)
  const id = config.marketId
  const [positionTuple, marketTuple, price] = await client.multicall({
    allowFailure: false,
    contracts: [
      {
        address: morphoBlue,
        abi: blueAbi,
        functionName: 'position',
        args: [id, user],
      },
      {
        address: morphoBlue,
        abi: blueAbi,
        functionName: 'market',
        args: [id],
      },
      {
        address: config.marketParams.oracle,
        abi: blueOracleAbi,
        functionName: 'price',
        args: [],
      },
    ],
  })

  return buildAccrualPosition(config, user, positionTuple, marketTuple, price)
}

export async function fetchMorphoStateWithAllowance(
  client: PublicClient,
  config: BorrowMarketConfig,
  user: Address,
  token: Address,
): Promise<{ current: AccrualPosition; allowance: bigint }> {
  const morphoBlue = requireMorphoBlueAddress(config.chainId)
  const id = config.marketId
  const [positionTuple, marketTuple, price, allowance] = await client.multicall(
    {
      allowFailure: false,
      contracts: [
        {
          address: morphoBlue,
          abi: blueAbi,
          functionName: 'position',
          args: [id, user],
        },
        {
          address: morphoBlue,
          abi: blueAbi,
          functionName: 'market',
          args: [id],
        },
        {
          address: config.marketParams.oracle,
          abi: blueOracleAbi,
          functionName: 'price',
          args: [],
        },
        {
          address: token,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [user, morphoBlue],
        },
      ],
    },
  )

  const current = buildAccrualPosition(
    config,
    user,
    positionTuple,
    marketTuple,
    price,
  )
  return { current, allowance }
}

function buildAccrualPosition(
  config: BorrowMarketConfig,
  user: Address,
  positionTuple: readonly [bigint, bigint, bigint],
  marketTuple: readonly [bigint, bigint, bigint, bigint, bigint, bigint],
  price: bigint,
): AccrualPosition {
  const market = buildMorphoMarket(config, marketTuple, price)
  const [supplyShares, borrowShares, collateral] = positionTuple
  return new AccrualPosition(
    {
      user,
      supplyShares,
      borrowShares,
      collateral,
    },
    market,
  )
}

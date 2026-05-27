import { AccrualPosition, type Market } from '@morpho-org/blue-sdk'
import {
  adaptiveCurveIrmAbi,
  blueAbi,
  blueOracleAbi,
} from '@morpho-org/blue-sdk-viem'
import { type Address, erc20Abi, type PublicClient } from 'viem'

import {
  buildMorphoBlueMarket,
  requireMorphoBlueAddress,
} from '@/actions/borrow/providers/morpho/blue.js'
import type { BorrowMarketConfig } from '@/types/borrow/index.js'

export async function fetchMorphoMarket(
  client: PublicClient,
  config: BorrowMarketConfig,
): Promise<Market> {
  const morphoBlue = requireMorphoBlueAddress(config.chainId)
  const id = config.marketId
  // `rateAtTarget` lives on the IRM, not the market. blue-sdk's
  // `Market.borrowApy` returns 0 unless this value is supplied, so we read it
  // alongside the market tuple to avoid a serial round-trip.
  const [marketTuple, price, rateAtTarget] = await client.multicall({
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
      {
        address: config.marketParams.irm,
        abi: adaptiveCurveIrmAbi,
        functionName: 'rateAtTarget',
        args: [id],
      },
    ],
  })

  return buildMorphoBlueMarket(config, marketTuple, price, rateAtTarget)
}

export async function fetchMorphoPosition(
  client: PublicClient,
  config: BorrowMarketConfig,
  user: Address,
): Promise<AccrualPosition> {
  const morphoBlue = requireMorphoBlueAddress(config.chainId)
  const id = config.marketId
  const [positionTuple, marketTuple, price, rateAtTarget] =
    await client.multicall({
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
          address: config.marketParams.irm,
          abi: adaptiveCurveIrmAbi,
          functionName: 'rateAtTarget',
          args: [id],
        },
      ],
    })

  return buildAccrualPosition(
    config,
    user,
    positionTuple,
    marketTuple,
    price,
    rateAtTarget,
  )
}

export async function fetchMorphoStateWithAllowance(
  client: PublicClient,
  config: BorrowMarketConfig,
  user: Address,
  token: Address,
): Promise<{ current: AccrualPosition; allowance: bigint }> {
  const morphoBlue = requireMorphoBlueAddress(config.chainId)
  const id = config.marketId
  const [positionTuple, marketTuple, price, rateAtTarget, allowance] =
    await client.multicall({
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
          address: config.marketParams.irm,
          abi: adaptiveCurveIrmAbi,
          functionName: 'rateAtTarget',
          args: [id],
        },
        {
          address: token,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [user, morphoBlue],
        },
      ],
    })

  const current = buildAccrualPosition(
    config,
    user,
    positionTuple,
    marketTuple,
    price,
    rateAtTarget,
  )
  return { current, allowance }
}

function buildAccrualPosition(
  config: BorrowMarketConfig,
  user: Address,
  positionTuple: readonly [bigint, bigint, bigint],
  marketTuple: readonly [bigint, bigint, bigint, bigint, bigint, bigint],
  price: bigint,
  rateAtTarget: bigint,
): AccrualPosition {
  const market = buildMorphoBlueMarket(config, marketTuple, price, rateAtTarget)
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

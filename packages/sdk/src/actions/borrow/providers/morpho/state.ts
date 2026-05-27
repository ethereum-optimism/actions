import { AccrualPosition, type Market } from '@morpho-org/blue-sdk'
import {
  adaptiveCurveIrmAbi,
  blueAbi,
  blueOracleAbi,
} from '@morpho-org/blue-sdk-viem'
import { type Address, erc20Abi, erc4626Abi, type PublicClient } from 'viem'

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

/**
 * 1:1 sharePrice sentinel, used when the borrow market's collateral token
 * is the underlying asset itself (not an ERC-4626 wrapper). Lets the
 * presentation layer apply `shares * sharePrice / 1e18` uniformly: the
 * non-vault branch ends up returning `shares` unchanged.
 */
const SHARE_PRICE_IDENTITY = 10n ** 18n

/**
 * True when the market's `collateralToken` differs from the configured
 * collateral asset address — i.e. collateral is a vault share that wraps
 * the underlying. Only ERC-4626-shaped collateral exposes `convertToAssets`,
 * so we gate that call on this check; calling it against a plain ERC-20
 * collateral would revert the entire multicall.
 */
function hasVaultCollateral(config: BorrowMarketConfig): boolean {
  const assetAddress = config.collateralAsset.address[config.chainId]
  if (assetAddress === undefined) return false
  return (
    assetAddress.toLowerCase() !==
    config.marketParams.collateralToken.toLowerCase()
  )
}

/**
 * Reads the four contracts every borrow-position multicall needs (position,
 * market, oracle price, IRM rate-at-target). Returned in the same order as
 * the contract list; callers append any additional reads they need.
 */
function corePositionContracts(
  morphoBlue: Address,
  config: BorrowMarketConfig,
  user: Address,
) {
  const id = config.marketId
  return [
    {
      address: morphoBlue,
      abi: blueAbi,
      functionName: 'position' as const,
      args: [id, user] as const,
    },
    {
      address: morphoBlue,
      abi: blueAbi,
      functionName: 'market' as const,
      args: [id] as const,
    },
    {
      address: config.marketParams.oracle,
      abi: blueOracleAbi,
      functionName: 'price' as const,
      args: [] as const,
    },
    {
      address: config.marketParams.irm,
      abi: adaptiveCurveIrmAbi,
      functionName: 'rateAtTarget' as const,
      args: [id] as const,
    },
  ] as const
}

function convertToAssetsContract(config: BorrowMarketConfig) {
  return {
    address: config.marketParams.collateralToken,
    abi: erc4626Abi,
    functionName: 'convertToAssets' as const,
    args: [10n ** 18n] as const,
  } as const
}

export async function fetchMorphoPosition(
  client: PublicClient,
  config: BorrowMarketConfig,
  user: Address,
): Promise<{ position: AccrualPosition; sharePrice: bigint }> {
  const morphoBlue = requireMorphoBlueAddress(config.chainId)
  const isVaultWrapped = hasVaultCollateral(config)
  // `sharePrice` is the underlying-asset value of 1 whole vault share
  // (`convertToAssets(1e18)`). Folding it into the multicall avoids a
  // serial round-trip when the position is read. The result is used to
  // present `collateralAmount` in the user-facing underlying asset units,
  // not raw vault shares (which would be off by ~5-12 decimal orders).
  // For markets with non-vault collateral, this read is omitted so the
  // multicall doesn't revert on a contract that lacks `convertToAssets`.
  if (isVaultWrapped) {
    const [positionTuple, marketTuple, price, rateAtTarget, sharePrice] =
      await client.multicall({
        allowFailure: false,
        contracts: [
          ...corePositionContracts(morphoBlue, config, user),
          convertToAssetsContract(config),
        ],
      })
    const position = buildAccrualPosition(
      config,
      user,
      positionTuple,
      marketTuple,
      price,
      rateAtTarget,
    )
    return { position, sharePrice }
  }

  const [positionTuple, marketTuple, price, rateAtTarget] =
    await client.multicall({
      allowFailure: false,
      contracts: corePositionContracts(morphoBlue, config, user),
    })
  const position = buildAccrualPosition(
    config,
    user,
    positionTuple,
    marketTuple,
    price,
    rateAtTarget,
  )
  return { position, sharePrice: SHARE_PRICE_IDENTITY }
}

export async function fetchMorphoStateWithAllowance(
  client: PublicClient,
  config: BorrowMarketConfig,
  user: Address,
  token: Address,
): Promise<{
  current: AccrualPosition
  sharePrice: bigint
  allowance: bigint
}> {
  const morphoBlue = requireMorphoBlueAddress(config.chainId)
  const isVaultWrapped = hasVaultCollateral(config)
  const allowanceContract = {
    address: token,
    abi: erc20Abi,
    functionName: 'allowance' as const,
    args: [user, morphoBlue] as const,
  } as const

  if (isVaultWrapped) {
    const [
      positionTuple,
      marketTuple,
      price,
      rateAtTarget,
      sharePrice,
      allowance,
    ] = await client.multicall({
      allowFailure: false,
      contracts: [
        ...corePositionContracts(morphoBlue, config, user),
        convertToAssetsContract(config),
        allowanceContract,
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
    return { current, sharePrice, allowance }
  }

  const [positionTuple, marketTuple, price, rateAtTarget, allowance] =
    await client.multicall({
      allowFailure: false,
      contracts: [
        ...corePositionContracts(morphoBlue, config, user),
        allowanceContract,
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
  return { current, sharePrice: SHARE_PRICE_IDENTITY, allowance }
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

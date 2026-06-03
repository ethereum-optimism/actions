import type { Address } from 'viem'
import { optimismSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { computeAaveBorrowMarketId } from '@/actions/borrow/providers/aave/marketId.js'
import {
  adaptAaveBorrowMarket,
  adaptAaveBorrowPosition,
  bpsToFraction,
  decodeReserveConfig,
  deriveLiquidationPrice,
  liquidationBonusFraction,
  projectAavePositionState,
  rayToFraction,
} from '@/actions/borrow/providers/aave/presentation.js'
import type { Asset } from '@/types/asset.js'
import type { AaveBorrowMarketConfig } from '@/types/borrow/index.js'

const WETH_ADDR = '0x4200000000000000000000000000000000000006' as Address
const USDC_ADDR = '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' as Address

const collateralAsset = {
  type: 'native',
  address: { [optimismSepolia.id]: WETH_ADDR },
  metadata: { symbol: 'ETH', name: 'Ether', decimals: 18 },
} satisfies Asset

const borrowAsset = {
  type: 'erc20',
  address: { [optimismSepolia.id]: USDC_ADDR },
  metadata: { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
} satisfies Asset

const config: AaveBorrowMarketConfig = {
  kind: 'aave-v3',
  marketId: computeAaveBorrowMarketId({
    chainId: optimismSepolia.id,
    collateralAddress: WETH_ADDR,
    debtAddress: USDC_ADDR,
  }),
  chainId: optimismSepolia.id,
  name: 'Aave ETH / USDC',
  collateralAsset,
  borrowAsset,
  borrowProvider: 'aave',
  lendProvider: 'aave',
  aave: {
    debtReserve: USDC_ADDR,
    collateralReserve: WETH_ADDR,
    collateralUsesWethGateway: true,
  },
}

describe('aave presentation conversions', () => {
  it('converts a ray rate to a decimal APR', () => {
    // 3.5% APR in ray = 0.035 * 1e27
    expect(rayToFraction(35_000_000_000_000_000_000_000_000n)).toBeCloseTo(
      0.035,
      6,
    )
  })

  it('converts basis points to a fraction', () => {
    expect(bpsToFraction(8250n)).toBeCloseTo(0.825, 6)
  })

  it('decodes the reserve configuration bitmap', () => {
    // ltv=8000, liqThreshold=8250, liqBonus=10500, decimals=18
    const data = 8000n | (8250n << 16n) | (10500n << 32n) | (18n << 48n)
    expect(decodeReserveConfig(data)).toEqual({
      ltvBps: 8000n,
      liquidationThresholdBps: 8250n,
      liquidationBonusBps: 10500n,
      decimals: 18,
    })
  })

  it('derives liquidation price for the synthetic pair', () => {
    // 1 ETH collateral (1e18), 1000 USDC debt (1000e6), threshold 82.5%.
    // price = debt / (collateral * threshold) in loan decimals
    //       = 1000e6 / (1 * 0.825) = ~1212.12e6
    const price = deriveLiquidationPrice({
      debtAmount: 1_000_000_000n,
      collateralAmount: 10n ** 18n,
      liquidationThresholdBps: 8250n,
      collateralDecimals: 18,
    })
    expect(price).toBe(1_212_121_212n)
  })

  it('returns zero liquidation price when there is no debt', () => {
    expect(
      deriveLiquidationPrice({
        debtAmount: 0n,
        collateralAmount: 10n ** 18n,
        liquidationThresholdBps: 8250n,
        collateralDecimals: 18,
      }),
    ).toBe(0n)
  })

  it('adapts a market with apy, maxLtv, and liquidation bonus', () => {
    const market = adaptAaveBorrowMarket(
      config,
      {
        variableBorrowRateRay: 35_000_000_000_000_000_000_000_000n,
        liquidationThresholdBps: 8250n,
        liquidationBonusBps: 10500n,
        totalBorrowed: 5n,
        totalCollateral: 7n,
      },
      0.05,
    )
    expect(market.marketId.kind).toBe('aave-v3')
    expect(market.borrowApy).toBeCloseTo(0.035, 6)
    expect(market.maxLtv).toBeCloseTo(0.825, 6)
    expect(market.liquidationBonus).toBeCloseTo(0.05, 6)
    expect(market.totalBorrowed).toBe(5n)
  })

  it('adapts a position with debt: shares equal amount, hf present', () => {
    const position = adaptAaveBorrowPosition(config, {
      collateralAmount: 10n ** 18n,
      debtAmount: 1_000_000_000n,
      healthFactorWad: 1_500_000_000_000_000_000n,
      liquidationThresholdBps: 8250n,
      liquidationBonusBps: 10500n,
      variableBorrowRateRay: 35_000_000_000_000_000_000_000_000n,
      totalCollateralBase: 3000n,
      totalDebtBase: 1000n,
    })
    expect(position.collateralShares).toBe(10n ** 18n)
    expect(position.healthFactor).toBeCloseTo(1.5, 6)
    expect(position.ltv).toBeCloseTo(1000 / 3000, 6)
    expect(position.liquidationPrice).toBeGreaterThan(0n)
  })

  it('clamps liquidation bonus to zero for a sub-100% (frozen) reserve', () => {
    expect(liquidationBonusFraction(10500n)).toBeCloseTo(0.05, 6)
    expect(liquidationBonusFraction(0n)).toBe(0)
    expect(liquidationBonusFraction(9000n)).toBe(0)
  })

  it('projects a repay (negative debt delta) as a higher health factor', () => {
    const current = {
      collateralAmount: 10n ** 18n,
      debtAmount: 1_000_000_000n,
      healthFactorWad: 1_500_000_000_000_000_000n,
      liquidationThresholdBps: 8250n,
      liquidationBonusBps: 10500n,
      variableBorrowRateRay: 0n,
      totalCollateralBase: 3000n,
      totalDebtBase: 1000n,
    }
    const prices = {
      collateralPrice: 300_000_000_000n,
      debtPrice: 100_000_000n,
    }
    const after = projectAavePositionState(
      current,
      prices,
      { collateralDelta: 0n, debtDelta: -500_000_000n },
      { collateral: 18, debt: 6 },
    )
    expect(after.debtAmount).toBe(500_000_000n)
    expect(after.healthFactorWad).toBeGreaterThan(current.healthFactorWad)
  })

  it('clamps a withdraw below zero collateral to zero', () => {
    const current = {
      collateralAmount: 10n ** 17n,
      debtAmount: 0n,
      healthFactorWad: 0n,
      liquidationThresholdBps: 8250n,
      liquidationBonusBps: 10500n,
      variableBorrowRateRay: 0n,
      totalCollateralBase: 300n,
      totalDebtBase: 0n,
    }
    const prices = {
      collateralPrice: 300_000_000_000n,
      debtPrice: 100_000_000n,
    }
    const after = projectAavePositionState(
      current,
      prices,
      { collateralDelta: -(10n ** 18n), debtDelta: 0n },
      { collateral: 18, debt: 6 },
    )
    expect(after.collateralAmount).toBe(0n)
  })

  it('adapts a debtless position: null hf and ltv, zero liq price', () => {
    const position = adaptAaveBorrowPosition(config, {
      collateralAmount: 10n ** 18n,
      debtAmount: 0n,
      healthFactorWad: 0n,
      liquidationThresholdBps: 8250n,
      liquidationBonusBps: 10500n,
      variableBorrowRateRay: 0n,
      totalCollateralBase: 3000n,
      totalDebtBase: 0n,
    })
    expect(position.healthFactor).toBeNull()
    expect(position.ltv).toBeNull()
    expect(position.liquidationPrice).toBe(0n)
  })
})

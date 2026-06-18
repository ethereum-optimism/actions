import { describe, expect, it } from 'vitest'
import {
  AaveETH,
  borrowCollateralVault,
  GauntletUSDCDemo,
  morphoBorrowMarketForVault,
  MorphoUSDCBorrowOPDemo,
} from './markets'

describe('borrowCollateralVault', () => {
  it('resolves the demo borrow market to its on-chain vault collateralToken', () => {
    expect(borrowCollateralVault(MorphoUSDCBorrowOPDemo)).toBe(
      MorphoUSDCBorrowOPDemo.marketParams.collateralToken,
    )
  })

  it('returns undefined for an unknown marketId', () => {
    expect(
      borrowCollateralVault({
        kind: 'morpho-blue',
        marketId: '0xdeadbeef',
        chainId: 84532,
      }),
    ).toBeUndefined()
  })

  it('returns undefined when the chainId does not match', () => {
    expect(
      borrowCollateralVault({
        kind: MorphoUSDCBorrowOPDemo.kind,
        marketId: MorphoUSDCBorrowOPDemo.marketId,
        chainId: 999999,
      }),
    ).toBeUndefined()
  })
})

describe('morphoBorrowMarketForVault', () => {
  it('maps a Morpho lend vault to its borrow market', () => {
    const borrowMarket = morphoBorrowMarketForVault(
      GauntletUSDCDemo.address,
      GauntletUSDCDemo.chainId,
    )
    expect(borrowMarket?.marketId).toBe(MorphoUSDCBorrowOPDemo.marketId)
  })

  it('returns undefined for an Aave lend market (no chaining needed)', () => {
    expect(
      morphoBorrowMarketForVault(AaveETH.address, AaveETH.chainId),
    ).toBeUndefined()
  })
})

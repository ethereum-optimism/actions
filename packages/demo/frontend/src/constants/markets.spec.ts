import { describe, expect, it } from 'vitest'
import { borrowCollateralVault, MorphoBorrowDemo } from './markets'

describe('borrowCollateralVault', () => {
  it('resolves the demo borrow market to its on-chain vault collateralToken', () => {
    expect(borrowCollateralVault(MorphoBorrowDemo)).toBe(
      MorphoBorrowDemo.marketParams.collateralToken,
    )
  })

  it('returns undefined for an unknown marketId', () => {
    expect(
      borrowCollateralVault({ marketId: '0xdeadbeef', chainId: 84532 }),
    ).toBeUndefined()
  })

  it('returns undefined when the chainId does not match', () => {
    expect(
      borrowCollateralVault({
        marketId: MorphoBorrowDemo.marketId,
        chainId: 999999,
      }),
    ).toBeUndefined()
  })
})

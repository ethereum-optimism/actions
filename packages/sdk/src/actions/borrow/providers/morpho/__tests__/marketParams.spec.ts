import { encodeAbiParameters, keccak256 } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  computeMorphoMarketId,
  verifyMorphoMarketId,
} from '@/actions/borrow/providers/morpho/marketParams.js'
import type { MorphoMarketParams } from '@/types/borrow/index.js'

const baseParams: MorphoMarketParams = {
  loanToken: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  collateralToken: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  oracle: '0xd5e6b5d72cd6dc5cab1f1c2c3c8b3c2c3c8b3c2c',
  irm: '0xbabbbabbbabbbabbbabbbabbbabbbabbbabbbabb',
  lltv: 860000000000000000n,
}

describe('computeMorphoMarketId', () => {
  it('produces the same hash as keccak256(abi.encode(MarketParams)) directly', () => {
    const encoded = encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint256' },
      ] as const,
      [
        baseParams.loanToken,
        baseParams.collateralToken,
        baseParams.oracle,
        baseParams.irm,
        baseParams.lltv,
      ],
    )
    const expected = keccak256(encoded)
    expect(computeMorphoMarketId(baseParams)).toBe(expected)
  })

  it('is deterministic for identical inputs', () => {
    expect(computeMorphoMarketId(baseParams)).toBe(
      computeMorphoMarketId({ ...baseParams }),
    )
  })

  it('changes when loanToken changes', () => {
    const a = computeMorphoMarketId(baseParams)
    const b = computeMorphoMarketId({
      ...baseParams,
      loanToken: '0x1111111111111111111111111111111111111111',
    })
    expect(a).not.toBe(b)
  })

  it('changes when collateralToken changes', () => {
    const a = computeMorphoMarketId(baseParams)
    const b = computeMorphoMarketId({
      ...baseParams,
      collateralToken: '0x2222222222222222222222222222222222222222',
    })
    expect(a).not.toBe(b)
  })

  it('changes when oracle changes', () => {
    const a = computeMorphoMarketId(baseParams)
    const b = computeMorphoMarketId({
      ...baseParams,
      oracle: '0x3333333333333333333333333333333333333333',
    })
    expect(a).not.toBe(b)
  })

  it('changes when irm changes', () => {
    const a = computeMorphoMarketId(baseParams)
    const b = computeMorphoMarketId({
      ...baseParams,
      irm: '0x4444444444444444444444444444444444444444',
    })
    expect(a).not.toBe(b)
  })

  it('changes when lltv changes', () => {
    const a = computeMorphoMarketId(baseParams)
    const b = computeMorphoMarketId({
      ...baseParams,
      lltv: 770000000000000000n,
    })
    expect(a).not.toBe(b)
  })
})

describe('verifyMorphoMarketId', () => {
  it('returns true when marketId matches params', () => {
    const id = computeMorphoMarketId(baseParams)
    expect(verifyMorphoMarketId(id, baseParams)).toBe(true)
  })

  it('returns false when marketId does not match params', () => {
    const id = computeMorphoMarketId(baseParams)
    expect(
      verifyMorphoMarketId(id, { ...baseParams, lltv: 770000000000000000n }),
    ).toBe(false)
  })

  it('matches regardless of marketId case', () => {
    const id = computeMorphoMarketId(baseParams)
    const upper = (id.slice(0, 2) + id.slice(2).toUpperCase()) as typeof id
    expect(verifyMorphoMarketId(upper, baseParams)).toBe(true)
  })
})

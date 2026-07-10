import type { BorrowMarketId } from '@eth-optimism/actions-sdk'
import { describe, expect, it } from 'vitest'

import { marketIdKey, sameMarketId } from './marketId'

const HEX_A = ('0x' + 'a'.repeat(64)) as `0x${string}`
const HEX_B = ('0x' + 'b'.repeat(64)) as `0x${string}`

const morpho: BorrowMarketId = {
  kind: 'morpho-blue',
  marketId: HEX_A,
  chainId: 84532,
}
const aave: BorrowMarketId = {
  kind: 'aave-v3',
  marketId: HEX_B,
  chainId: 11155420,
}

describe('borrow marketId helpers', () => {
  it('matches an aave-v3 id to itself (case-insensitive)', () => {
    expect(sameMarketId(aave, { ...aave })).toBe(true)
    expect(
      sameMarketId(aave, { ...aave, marketId: HEX_B.toUpperCase() as never }),
    ).toBe(true)
  })

  it('does not match across kinds even with the same hex/chain', () => {
    expect(
      sameMarketId(
        { kind: 'aave-v3', marketId: HEX_A, chainId: 84532 },
        morpho,
      ),
    ).toBe(false)
  })

  it('produces a stable, kind-distinct key for every variant (no "unknown")', () => {
    expect(marketIdKey(aave)).toBe(`aave-v3-${HEX_B}-11155420`)
    expect(marketIdKey(morpho)).toBe(`morpho-blue-${HEX_A}-84532`)
    expect(marketIdKey(aave)).not.toContain('unknown')
  })
})

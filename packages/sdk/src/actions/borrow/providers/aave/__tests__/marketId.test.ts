import type { Address } from 'viem'
import { optimismSepolia } from 'viem/chains'
import { describe, expect, it } from 'vitest'

import { marketIdMatches } from '@/actions/borrow/core/markets.js'
import { computeAaveBorrowMarketId } from '@/actions/borrow/providers/aave/marketId.js'
import type { BorrowMarketId } from '@/types/borrow/index.js'

const WETH = '0x4200000000000000000000000000000000000006' as Address
const USDC = '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' as Address
const OP = '0x4200000000000000000000000000000000000042' as Address

describe('computeAaveBorrowMarketId', () => {
  it('is deterministic for the same inputs', () => {
    const a = computeAaveBorrowMarketId({
      chainId: optimismSepolia.id,
      collateralAddress: WETH,
      debtAddress: USDC,
    })
    const b = computeAaveBorrowMarketId({
      chainId: optimismSepolia.id,
      collateralAddress: WETH,
      debtAddress: USDC,
    })
    expect(a).toBe(b)
    expect(a).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('differs when collateral, debt, or chain differs', () => {
    const base = computeAaveBorrowMarketId({
      chainId: optimismSepolia.id,
      collateralAddress: WETH,
      debtAddress: USDC,
    })
    expect(
      computeAaveBorrowMarketId({
        chainId: optimismSepolia.id,
        collateralAddress: WETH,
        debtAddress: OP,
      }),
    ).not.toBe(base)
    expect(
      computeAaveBorrowMarketId({
        chainId: 10,
        collateralAddress: WETH,
        debtAddress: USDC,
      }),
    ).not.toBe(base)
  })

  it('round-trips through the variant-agnostic marketIdMatches', () => {
    const marketId = computeAaveBorrowMarketId({
      chainId: optimismSepolia.id,
      collateralAddress: WETH,
      debtAddress: USDC,
    })
    const aave: BorrowMarketId = {
      kind: 'aave-v3',
      marketId,
      chainId: optimismSepolia.id,
    }
    expect(marketIdMatches(aave, { ...aave })).toBe(true)
    // Same hex but a different kind must not match.
    const morpho: BorrowMarketId = {
      kind: 'morpho-blue',
      marketId,
      chainId: optimismSepolia.id,
    }
    expect(marketIdMatches(aave, morpho)).toBe(false)
  })
})

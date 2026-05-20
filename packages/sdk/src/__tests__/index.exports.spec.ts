import { describe, expect, it } from 'vitest'

import { BorrowProvider } from '@/actions/borrow/core/BorrowProvider.js'
import { MorphoBorrowProvider } from '@/actions/borrow/providers/morpho/MorphoBorrowProvider.js'
import {
  computeMorphoMarketId,
  verifyMorphoMarketId,
} from '@/actions/shared/morpho/marketParams.js'
import {
  BorrowProvider as PublicBorrowProvider,
  computeMorphoMarketId as publicComputeMorphoMarketId,
  MorphoBorrowProvider as PublicMorphoBorrowProvider,
  verifyMorphoMarketId as publicVerifyMorphoMarketId,
} from '@/index.js'

describe('public index exports', () => {
  it('re-exports borrow provider classes', () => {
    expect(PublicBorrowProvider).toBe(BorrowProvider)
    expect(PublicMorphoBorrowProvider).toBe(MorphoBorrowProvider)
  })

  it('re-exports Morpho market id helpers', () => {
    expect(publicComputeMorphoMarketId).toBe(computeMorphoMarketId)
    expect(publicVerifyMorphoMarketId).toBe(verifyMorphoMarketId)
  })
})

import { describe, expect, it } from 'vitest'

import { resolveSupportedChainIds } from '@/utils/validation.js'

describe('resolveSupportedChainIds', () => {
  it('returns the intersection of protocol, sdk, and configured chains', () => {
    expect(resolveSupportedChainIds([1, 10, 999], [10, 8453, 999])).toEqual([
      10,
    ])
  })

  it('preserves protocol order for the surviving chains', () => {
    expect(resolveSupportedChainIds([8453, 10, 1], [1, 10, 8453])).toEqual([
      8453, 10, 1,
    ])
  })
})

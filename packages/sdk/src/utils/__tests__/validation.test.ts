import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  AddressRequiredError,
  InvalidParamsError,
  ZeroAddressError,
} from '@/core/error/errors.js'
import {
  resolveSupportedChainIds,
  validateWalletAddress,
} from '@/utils/validation.js'

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

describe('validateWalletAddress', () => {
  it('accepts a syntactically valid address', () => {
    expect(() =>
      validateWalletAddress('0x000000000000000000000000000000000000beef'),
    ).not.toThrow()
  })

  it('throws AddressRequiredError when undefined', () => {
    expect(() => validateWalletAddress(undefined)).toThrow(AddressRequiredError)
  })

  it('throws InvalidParamsError for a malformed address', () => {
    expect(() => validateWalletAddress('0x1' as Address)).toThrow(
      InvalidParamsError,
    )
  })

  it('throws ZeroAddressError for the zero address', () => {
    expect(() =>
      validateWalletAddress('0x0000000000000000000000000000000000000000'),
    ).toThrow(ZeroAddressError)
  })
})

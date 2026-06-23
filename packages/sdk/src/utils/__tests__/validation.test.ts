import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  AddressRequiredError,
  InvalidAmountError,
  InvalidParamsError,
  SlippageOutOfRangeError,
  ZeroAddressError,
} from '@/core/error/errors.js'
import {
  resolveSupportedChainIds,
  validateAmountPositiveIfExists,
  validateSlippage,
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

describe('validateSlippage', () => {
  const maxSlippage = 0.5

  it.each([NaN, Infinity, -Infinity, -0.1, 1.0, 1.5])(
    'throws SlippageOutOfRangeError for %p',
    (slippage) => {
      expect(() => validateSlippage(slippage, maxSlippage)).toThrow(
        SlippageOutOfRangeError,
      )
    },
  )

  it('throws when slippage exceeds maxSlippage', () => {
    expect(() => validateSlippage(0.6, maxSlippage)).toThrow(
      SlippageOutOfRangeError,
    )
  })

  it.each([0, 0.005, 0.5])('accepts %p when within maxSlippage', (slippage) => {
    expect(() => validateSlippage(slippage, maxSlippage)).not.toThrow()
  })

  it('accepts a value just under 1 when maxSlippage allows it', () => {
    expect(() => validateSlippage(0.999, 1.0)).not.toThrow()
  })

  it('enforces the absolute >= 1 ceiling independent of maxSlippage', () => {
    // 1.5 <= maxSlippage (2.0) but the absolute ceiling still rejects it, so a
    // misconfigured maxSlippage > 1 cannot admit a negative-floor slippage.
    expect(() => validateSlippage(1.5, 2.0)).toThrow(SlippageOutOfRangeError)
  })
})

describe('validateAmountPositiveIfExists', () => {
  it.each([NaN, Infinity, -Infinity, 0, -1])(
    'throws InvalidAmountError for %p',
    (amount) => {
      expect(() => validateAmountPositiveIfExists(amount)).toThrow(
        InvalidAmountError,
      )
    },
  )

  it('accepts undefined', () => {
    expect(() => validateAmountPositiveIfExists(undefined)).not.toThrow()
  })

  it.each([0.000001, 1, 1_000_000])(
    'accepts the positive finite number %p',
    (amount) => {
      expect(() => validateAmountPositiveIfExists(amount)).not.toThrow()
    },
  )
})

import {
  AmountRequiredError,
  BorrowMarketParamsMismatchError,
  ChainNotSupportedError,
  ConflictingAmountsError,
  InvalidAmountError,
  MarketIdRequiredError,
  MarketNotAllowedError,
  MarketNotFoundError,
  ProviderNotConfiguredError,
  QuoteExpiredError,
  QuoteRecipientMismatchError,
} from '@eth-optimism/actions-sdk'
import { describe, expect, it } from 'vitest'

import { mapSdkError } from './errors.js'

describe('mapSdkError', () => {
  it('maps MarketNotAllowedError to 403 with a static message', () => {
    const result = mapSdkError(
      new MarketNotAllowedError({
        address: '0xabc',
        chainId: 84532,
        reason: 'leaky internal detail',
      }),
    )
    expect(result).toEqual({
      status: 403,
      message: 'Market is not in the allowlist.',
    })
  })

  it('maps MarketNotFoundError to 404', () => {
    expect(mapSdkError(new MarketNotFoundError({ chainId: 84532 }))).toEqual({
      status: 404,
      message: 'Market not found.',
    })
  })

  it('maps MarketIdRequiredError to 400', () => {
    expect(mapSdkError(new MarketIdRequiredError())).toEqual({
      status: 400,
      message: 'Market id is required.',
    })
  })

  it('maps ChainNotSupportedError to 400', () => {
    expect(
      mapSdkError(
        new ChainNotSupportedError({ chainId: 1, supportedChainIds: [84532] }),
      ),
    ).toEqual({
      status: 400,
      message: 'Chain not supported.',
    })
  })

  it('maps AmountRequiredError to 400', () => {
    expect(mapSdkError(new AmountRequiredError())).toEqual({
      status: 400,
      message: 'Amount is required.',
    })
  })

  it('maps InvalidAmountError to 400', () => {
    expect(mapSdkError(new InvalidAmountError(-1))).toEqual({
      status: 400,
      message: 'Invalid amount.',
    })
  })

  it('maps ConflictingAmountsError to 400', () => {
    expect(mapSdkError(new ConflictingAmountsError())).toEqual({
      status: 400,
      message:
        'Conflicting amounts; provide exactly one of amount or amountRaw.',
    })
  })

  it('maps BorrowMarketParamsMismatchError to 422', () => {
    expect(
      mapSdkError(
        new BorrowMarketParamsMismatchError({
          marketId: '0xabc',
          computedMarketId: '0xexpected',
        }),
      ),
    ).toEqual({
      status: 422,
      message: 'Borrow market parameters do not match the configured market.',
    })
  })

  it('maps QuoteExpiredError to 410', () => {
    expect(
      mapSdkError(new QuoteExpiredError({ expiresAt: 0, currentTime: 1 })),
    ).toEqual({
      status: 410,
      message: 'Quote has expired; please re-quote.',
    })
  })

  it('maps QuoteRecipientMismatchError to 403', () => {
    expect(
      mapSdkError(
        new QuoteRecipientMismatchError({
          quoteRecipient: '0x1',
          walletAddress: '0x2',
        }),
      ),
    ).toEqual({
      status: 403,
      message: 'Quote recipient does not match the executing wallet.',
    })
  })

  it('maps ProviderNotConfiguredError to 503', () => {
    expect(
      mapSdkError(
        new ProviderNotConfiguredError({
          provider: 'morpho',
          details: 'x',
        }),
      ),
    ).toEqual({
      status: 503,
      message: 'Provider not configured for this market.',
    })
  })

  it('returns undefined for a generic Error', () => {
    expect(mapSdkError(new Error('something else'))).toBeUndefined()
  })

  it('returns undefined for a non-Error value', () => {
    expect(mapSdkError('not an error')).toBeUndefined()
    expect(mapSdkError(undefined)).toBeUndefined()
    expect(mapSdkError(null)).toBeUndefined()
    expect(mapSdkError({ message: 'bare object' })).toBeUndefined()
  })

  it('never throws even if instanceof check raises', () => {
    const weird = Object.create({
      get constructor(): never {
        throw new Error('boom')
      },
    })
    expect(() => mapSdkError(weird)).not.toThrow()
    expect(mapSdkError(weird)).toBeUndefined()
  })

  it('does not leak the inner error message', () => {
    const result = mapSdkError(
      new MarketNotAllowedError({
        address: '0xabc',
        chainId: 84532,
        reason: 'sensitive: http://internal',
      }),
    )
    expect(result?.message).toBe('Market is not in the allowlist.')
    expect(result?.message).not.toContain('sensitive')
    expect(result?.message).not.toContain('http')
  })
})

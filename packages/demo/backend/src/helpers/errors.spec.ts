import { describe, expect, it } from 'vitest'

import {
  BorrowProviderNotConfiguredError,
  ChainNotSupportedError,
  HealthFactorTooLowError,
  InsufficientCollateralError,
  InsufficientLiquidityError,
  MarketNotAllowedError,
  MarketNotFoundError,
  QuoteExpiredError,
  QuoteRecipientMismatchError,
} from '@/types/borrow-sdk-stubs.js'

import { mapSdkError } from './errors.js'

describe('mapSdkError', () => {
  it('maps MarketNotAllowedError to 403 with a static message', () => {
    const result = mapSdkError(new MarketNotAllowedError('internal detail'))
    expect(result).toEqual({
      status: 403,
      message: 'Market is not in the allowlist.',
    })
  })

  it('maps MarketNotFoundError to 404', () => {
    expect(mapSdkError(new MarketNotFoundError('x'))).toEqual({
      status: 404,
      message: 'Market not found.',
    })
  })

  it('maps ChainNotSupportedError to 400', () => {
    expect(mapSdkError(new ChainNotSupportedError('x'))).toEqual({
      status: 400,
      message: 'Chain not supported.',
    })
  })

  it('maps InsufficientLiquidityError to 422', () => {
    expect(mapSdkError(new InsufficientLiquidityError('x'))).toEqual({
      status: 422,
      message: 'Insufficient liquidity in the market.',
    })
  })

  it('maps InsufficientCollateralError to 422', () => {
    expect(mapSdkError(new InsufficientCollateralError('x'))).toEqual({
      status: 422,
      message: 'Insufficient collateral.',
    })
  })

  it('maps HealthFactorTooLowError to 422', () => {
    expect(mapSdkError(new HealthFactorTooLowError('x'))).toEqual({
      status: 422,
      message: 'Resulting health factor is too low.',
    })
  })

  it('maps QuoteExpiredError to 410', () => {
    expect(mapSdkError(new QuoteExpiredError('x'))).toEqual({
      status: 410,
      message: 'Quote has expired; please re-quote.',
    })
  })

  it('maps QuoteRecipientMismatchError to 403', () => {
    expect(mapSdkError(new QuoteRecipientMismatchError('x'))).toEqual({
      status: 403,
      message: 'Quote recipient does not match the executing wallet.',
    })
  })

  it('maps BorrowProviderNotConfiguredError to 503', () => {
    expect(mapSdkError(new BorrowProviderNotConfiguredError('x'))).toEqual({
      status: 503,
      message: 'Borrow provider not configured.',
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
      new MarketNotAllowedError('sensitive: 0xabc... rpc=http://internal'),
    )
    expect(result?.message).toBe('Market is not in the allowlist.')
    expect(result?.message).not.toContain('sensitive')
    expect(result?.message).not.toContain('http')
  })
})

import {
  AddressRequiredError,
  AmountRequiredError,
  AssetMetadataRequiredError,
  AssetNotSupportedOnChainError,
  BorrowMarketParamsMismatchError,
  ChainNotSupportedError,
  ConflictingAmountsError,
  EmptyPositionError,
  InvalidAmountError,
  InvalidParamsError,
  MarketIdRequiredError,
  MarketNotAllowedError,
  MarketNotFoundError,
  NativeAssetAddressError,
  ProtocolContractsNotConfiguredError,
  ProviderNotConfiguredError,
  QuoteExpiredError,
  QuoteRecipientMismatchError,
  QuoteRecipientMissingError,
  ZeroAddressError,
} from '@eth-optimism/actions-sdk'
import { describe, expect, it } from 'vitest'

import { mapSdkError, WalletNotFoundError } from './errors.js'

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

  it('maps WalletNotFoundError to 404', () => {
    expect(mapSdkError(new WalletNotFoundError())).toEqual({
      status: 404,
      message: 'Wallet not found.',
    })
  })

  it('maps AddressRequiredError to 400', () => {
    expect(mapSdkError(new AddressRequiredError('recipient'))).toEqual({
      status: 400,
      message: 'Address is required.',
    })
  })

  it('maps ZeroAddressError to 400', () => {
    expect(mapSdkError(new ZeroAddressError('recipient'))).toEqual({
      status: 400,
      message: 'Address must not be the zero address.',
    })
  })

  it('maps InvalidParamsError to 400', () => {
    expect(
      mapSdkError(
        new InvalidParamsError({ param: 'borrowAmount', expected: 'positive' }),
      ),
    ).toEqual({
      status: 400,
      message: 'Invalid parameters.',
    })
  })

  it('maps QuoteRecipientMissingError to 400', () => {
    expect(mapSdkError(new QuoteRecipientMissingError())).toEqual({
      status: 400,
      message: 'Quote recipient is required.',
    })
  })

  it('maps AssetNotSupportedOnChainError to 400', () => {
    expect(
      mapSdkError(new AssetNotSupportedOnChainError('XYZ', 84532)),
    ).toEqual({
      status: 400,
      message: 'Asset is not supported on this chain.',
    })
  })

  it('maps NativeAssetAddressError to 400', () => {
    expect(mapSdkError(new NativeAssetAddressError('ETH'))).toEqual({
      status: 400,
      message: 'Native asset cannot be referenced by address.',
    })
  })

  it('maps AssetMetadataRequiredError to 400', () => {
    expect(mapSdkError(new AssetMetadataRequiredError())).toEqual({
      status: 400,
      message: 'Asset metadata is required.',
    })
  })

  it('maps EmptyPositionError to 422', () => {
    expect(mapSdkError(new EmptyPositionError({ operation: 'repay' }))).toEqual(
      {
        status: 422,
        message: 'No position to operate on.',
      },
    )
  })

  it('maps ProtocolContractsNotConfiguredError to 503', () => {
    expect(
      mapSdkError(
        new ProtocolContractsNotConfiguredError({
          protocol: 'morpho',
          chainId: 84532,
        }),
      ),
    ).toEqual({
      status: 503,
      message: 'Protocol contracts are not configured for this chain.',
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

// Regression guard: every exported SDK ActionsError subclass is either
// covered by `mapSdkError` or explicitly listed below as intentionally
// unmapped (swap-specific surface that borrow routes never raise). When
// the SDK adds a new error class, this test fails until it's mapped or
// added to the allowlist with a justification.
describe('mapSdkError coverage', () => {
  const INTENTIONALLY_UNMAPPED = new Set([
    'SameAssetError',
    'ExactOutputNotSupportedError',
    'SlippageOutOfRangeError',
  ])

  it('maps every exported ActionsError subclass or allowlists it', async () => {
    const sdk = (await import('@eth-optimism/actions-sdk')) as Record<
      string,
      unknown
    >
    const actionsErrorCtor = sdk.ActionsError as
      | (new (...args: unknown[]) => Error)
      | undefined
    expect(actionsErrorCtor, 'SDK does not export ActionsError').toBeDefined()

    const errorClasses = Object.entries(sdk)
      .filter(([name, value]) => {
        if (typeof value !== 'function') return false
        if (!name.endsWith('Error')) return false
        if (value === actionsErrorCtor) return false
        return (
          (value as { prototype?: unknown }).prototype instanceof
          (actionsErrorCtor as new () => Error)
        )
      })
      .map(([name, value]) => ({
        name,
        ctor: value as new () => Error,
      }))

    expect(
      errorClasses.length,
      'should find SDK error classes',
    ).toBeGreaterThan(0)

    const unmapped: string[] = []
    for (const { name, ctor } of errorClasses) {
      if (INTENTIONALLY_UNMAPPED.has(name)) continue
      const stub = Object.create(ctor.prototype)
      const mapped = mapSdkError(stub)
      if (!mapped) unmapped.push(name)
    }

    expect(
      unmapped,
      `Unmapped SDK error classes: ${unmapped.join(', ')}. Either add a branch in mapSdkError or list them in INTENTIONALLY_UNMAPPED.`,
    ).toEqual([])
  })
})

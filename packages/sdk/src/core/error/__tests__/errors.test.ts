import { BaseError } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  ActionsError,
  AddressRequiredError,
  AmountRequiredError,
  AssetMetadataRequiredError,
  AssetNotSupportedOnChainError,
  ChainNotSupportedError,
  ConflictingAmountsError,
  ExactOutputNotSupportedError,
  InvalidAmountError,
  InvalidParamsError,
  MarketIdRequiredError,
  MarketNotAllowedError,
  MarketNotFoundError,
  NativeAssetAddressError,
  ProviderNotConfiguredError,
  QuoteExpiredError,
  QuoteRecipientMismatchError,
  QuoteRecipientMissingError,
  QuoteWalletAddressMissingError,
  SameAssetError,
  SlippageOutOfRangeError,
  ZeroAddressError,
} from '@/core/error/errors.js'

describe('ActionsError hierarchy', () => {
  it('ChainNotSupportedError', () => {
    const err = new ChainNotSupportedError({
      chainId: 999,
      supportedChainIds: [10, 8453],
    })
    expect(err.name).toBe('ChainNotSupportedError')
    expect(err.chainId).toBe(999)
    expect(err.supportedChainIds).toEqual([10, 8453])
    expect(err).toBeInstanceOf(ActionsError)
    expect(err).toBeInstanceOf(BaseError)
    expect(err.shortMessage).toContain('999')
  })

  it('MarketNotAllowedError with pair', () => {
    const err = new MarketNotAllowedError({
      assetInSymbol: 'ETH',
      assetOutSymbol: 'USDC',
      chainId: 10,
      reason: 'Pair is blocked',
    })
    expect(err.name).toBe('MarketNotAllowedError')
    expect(err.assetInSymbol).toBe('ETH')
    expect(err.assetOutSymbol).toBe('USDC')
    expect(err.chainId).toBe(10)
    expect(err).toBeInstanceOf(ActionsError)
    expect(err).toBeInstanceOf(BaseError)
    expect(err.shortMessage).toContain('ETH/USDC')
  })

  it('MarketNotAllowedError with address', () => {
    const err = new MarketNotAllowedError({
      address: '0xabc',
      chainId: 8453,
    })
    expect(err.address).toBe('0xabc')
    expect(err.shortMessage).toContain('0xabc')
  })

  it('ProviderNotConfiguredError', () => {
    const err = new ProviderNotConfiguredError({
      provider: 'lend',
      details: 'Please configure lend',
    })
    expect(err.name).toBe('ProviderNotConfiguredError')
    expect(err.provider).toBe('lend')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toContain('lend')
  })

  it('MarketIdRequiredError', () => {
    const err = new MarketIdRequiredError()
    expect(err.name).toBe('MarketIdRequiredError')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toBe('marketId is required')
  })

  it('AmountRequiredError', () => {
    const err = new AmountRequiredError()
    expect(err.name).toBe('AmountRequiredError')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toContain('amountIn or amountOut')
  })

  it('InvalidAmountError', () => {
    const err = new InvalidAmountError(-5)
    expect(err.name).toBe('InvalidAmountError')
    expect(err.amount).toBe(-5)
    expect(err).toBeInstanceOf(ActionsError)
  })

  it('ConflictingAmountsError', () => {
    const err = new ConflictingAmountsError()
    expect(err.name).toBe('ConflictingAmountsError')
    expect(err).toBeInstanceOf(ActionsError)
  })

  it('SameAssetError', () => {
    const err = new SameAssetError('USDC')
    expect(err.name).toBe('SameAssetError')
    expect(err.symbol).toBe('USDC')
    expect(err).toBeInstanceOf(ActionsError)
  })

  it('QuoteExpiredError', () => {
    const err = new QuoteExpiredError({ expiresAt: 1000, currentTime: 2000 })
    expect(err.name).toBe('QuoteExpiredError')
    expect(err.expiresAt).toBe(1000)
    expect(err.currentTime).toBe(2000)
    expect(err).toBeInstanceOf(ActionsError)
  })

  it('QuoteRecipientMismatchError', () => {
    const err = new QuoteRecipientMismatchError({
      quoteRecipient: '0xaaa',
      walletAddress: '0xbbb',
    })
    expect(err.name).toBe('QuoteRecipientMismatchError')
    expect(err.quoteRecipient).toBe('0xaaa')
    expect(err.walletAddress).toBe('0xbbb')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toContain('0xaaa')
    expect(err.shortMessage).toContain('0xbbb')
    expect(err.shortMessage).not.toContain('SwapQuote')
    expect(err.shortMessage).not.toContain('wallet.swap')
  })

  it('QuoteRecipientMissingError', () => {
    const err = new QuoteRecipientMissingError()
    expect(err.name).toBe('QuoteRecipientMissingError')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).not.toContain('SwapQuote')
    expect(err.shortMessage).toContain('Quote.recipient')
  })

  it('QuoteWalletAddressMissingError', () => {
    const err = new QuoteWalletAddressMissingError()
    expect(err.name).toBe('QuoteWalletAddressMissingError')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toContain('Quote.walletAddress')
    expect(err.shortMessage).toContain('wallet.swap.getQuote')
  })

  it('ExactOutputNotSupportedError', () => {
    const err = new ExactOutputNotSupportedError('Velodrome')
    expect(err.name).toBe('ExactOutputNotSupportedError')
    expect(err.provider).toBe('Velodrome')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toContain('Velodrome')
  })

  it('AddressRequiredError', () => {
    const err = new AddressRequiredError('walletAddress')
    expect(err.name).toBe('AddressRequiredError')
    expect(err.label).toBe('walletAddress')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toBe('walletAddress is required')
  })

  it('ZeroAddressError', () => {
    const err = new ZeroAddressError('walletAddress', '0x0')
    expect(err.name).toBe('ZeroAddressError')
    expect(err.label).toBe('walletAddress')
    expect(err.address).toBe('0x0')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toContain('walletAddress')
  })

  it('SlippageOutOfRangeError', () => {
    const err = new SlippageOutOfRangeError(0.6, 0.5)
    expect(err.name).toBe('SlippageOutOfRangeError')
    expect(err.slippage).toBe(0.6)
    expect(err.maxSlippage).toBe(0.5)
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toContain('0.6')
  })

  it('AssetNotSupportedOnChainError', () => {
    const err = new AssetNotSupportedOnChainError('USDC', 999)
    expect(err.name).toBe('AssetNotSupportedOnChainError')
    expect(err.symbol).toBe('USDC')
    expect(err.chainId).toBe(999)
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toContain('USDC')
    expect(err.shortMessage).toContain('999')
  })

  it('NativeAssetAddressError', () => {
    const err = new NativeAssetAddressError('ETH')
    expect(err.name).toBe('NativeAssetAddressError')
    expect(err.symbol).toBe('ETH')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toContain('ETH')
  })

  it('MarketNotFoundError with poolId', () => {
    const err = new MarketNotFoundError({ chainId: 10, poolId: '0xabc' })
    expect(err.name).toBe('MarketNotFoundError')
    expect(err.chainId).toBe(10)
    expect(err.poolId).toBe('0xabc')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err).toBeInstanceOf(BaseError)
    expect(err.shortMessage).toContain('0xabc')
    expect(err.shortMessage).toContain('10')
  })

  it('MarketNotFoundError without poolId', () => {
    const err = new MarketNotFoundError({ chainId: 8453 })
    expect(err.chainId).toBe(8453)
    expect(err.poolId).toBeUndefined()
    expect(err.shortMessage).toContain('8453')
  })

  it('AssetMetadataRequiredError', () => {
    const err = new AssetMetadataRequiredError('decimals field is missing')
    expect(err.name).toBe('AssetMetadataRequiredError')
    expect(err.context).toBe('decimals field is missing')
    expect(err).toBeInstanceOf(ActionsError)
    expect(err.shortMessage).toBe('Asset metadata is required')
  })

  it('all errors are instanceof BaseError', () => {
    const errors = [
      new AddressRequiredError('x'),
      new ChainNotSupportedError({ chainId: 1 }),
      new MarketNotAllowedError({ chainId: 1 }),
      new MarketNotFoundError({ chainId: 1 }),
      new ProviderNotConfiguredError({ provider: 'x' }),
      new MarketIdRequiredError(),
      new AmountRequiredError(),
      new InvalidAmountError(0),
      new ConflictingAmountsError(),
      new SameAssetError('ETH'),
      new QuoteExpiredError({ expiresAt: 0, currentTime: 1 }),
      new QuoteRecipientMismatchError({
        quoteRecipient: '0xaaa',
        walletAddress: '0xbbb',
      }),
      new QuoteRecipientMissingError(),
      new QuoteWalletAddressMissingError(),
      new ExactOutputNotSupportedError('X'),
      new ZeroAddressError('label'),
      new SlippageOutOfRangeError(1, 0.5),
      new AssetNotSupportedOnChainError('X', 1),
      new NativeAssetAddressError('ETH'),
      new AssetMetadataRequiredError(),
      new InvalidParamsError({ param: 'x', expected: 'y' }),
    ]
    for (const err of errors) {
      expect(err).toBeInstanceOf(ActionsError)
      expect(err).toBeInstanceOf(BaseError)
    }
  })

  it('InvalidParamsError carries param + expected (and optional received)', () => {
    const err = new InvalidParamsError({
      param: 'chainIds',
      expected: 'SupportedChainId[] (non-empty)',
      received: '[]',
    })
    expect(err.name).toBe('InvalidParamsError')
    expect(err.param).toBe('chainIds')
    expect(err.expected).toBe('SupportedChainId[] (non-empty)')
    expect(err.received).toBe('[]')
    expect(err.shortMessage).toContain('chainIds')
    expect(err).toBeInstanceOf(ActionsError)
  })
})

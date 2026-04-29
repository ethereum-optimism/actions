import { BaseError } from 'viem'

/**
 * Abstract base class for all Actions SDK errors.
 * Extends viem's BaseError so callers can use instanceof narrowing
 * and structured metaMessages alongside the shortMessage.
 */
export abstract class ActionsError extends BaseError {}

// ─────────────────────────────────────────────────────────────────────────────
// Chain / Network
// ─────────────────────────────────────────────────────────────────────────────

export class ChainNotSupportedError extends ActionsError {
  override name = 'ChainNotSupportedError' as const
  chainId: number
  supportedChainIds: readonly number[]

  constructor(chainId: number, supportedChainIds: readonly number[]) {
    super(`Chain ${chainId} is not supported`, {
      metaMessages: [`Supported chains: ${supportedChainIds.join(', ')}`],
    })
    this.chainId = chainId
    this.supportedChainIds = supportedChainIds
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Market / Provider
// ─────────────────────────────────────────────────────────────────────────────

export class MarketNotAllowedError extends ActionsError {
  override name = 'MarketNotAllowedError' as const
  chainId: number
  assetInSymbol?: string
  assetOutSymbol?: string
  address?: string

  constructor(params: {
    chainId: number
    assetInSymbol?: string
    assetOutSymbol?: string
    address?: string
    reason?: string
  }) {
    const pair =
      params.assetInSymbol && params.assetOutSymbol
        ? `${params.assetInSymbol}/${params.assetOutSymbol}`
        : (params.address ?? 'unknown')
    super(`Market ${pair} not allowed on chain ${params.chainId}`, {
      metaMessages: params.reason ? [params.reason] : undefined,
    })
    this.chainId = params.chainId
    this.assetInSymbol = params.assetInSymbol
    this.assetOutSymbol = params.assetOutSymbol
    this.address = params.address
  }
}

export class ProviderNotConfiguredError extends ActionsError {
  override name = 'ProviderNotConfiguredError' as const
  provider: string

  constructor(provider: string, details?: string) {
    super(`Provider '${provider}' is not configured`, {
      metaMessages: details ? [details] : undefined,
    })
    this.provider = provider
  }
}

export class MarketIdRequiredError extends ActionsError {
  override name = 'MarketIdRequiredError' as const

  constructor(details?: string) {
    super('marketId is required', {
      metaMessages: details ? [details] : undefined,
    })
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Amount / Swap Parameters
// ─────────────────────────────────────────────────────────────────────────────

export class AmountRequiredError extends ActionsError {
  override name = 'AmountRequiredError' as const

  constructor() {
    super('Either amountIn or amountOut must be provided')
  }
}

export class InvalidAmountError extends ActionsError {
  override name = 'InvalidAmountError' as const
  amount: number

  constructor(amount: number) {
    super('Amount must be positive', {
      metaMessages: [`Received: ${amount}`],
    })
    this.amount = amount
  }
}

export class ConflictingAmountsError extends ActionsError {
  override name = 'ConflictingAmountsError' as const

  constructor() {
    super('Provide either amountIn or amountOut, not both')
  }
}

export class SameAssetError extends ActionsError {
  override name = 'SameAssetError' as const
  symbol: string

  constructor(symbol: string) {
    super('Cannot swap an asset for itself', {
      metaMessages: [`Asset: ${symbol}`],
    })
    this.symbol = symbol
  }
}

export class QuoteExpiredError extends ActionsError {
  override name = 'QuoteExpiredError' as const
  expiresAt: number
  currentTime: number

  constructor(expiresAt: number, currentTime: number) {
    super('Quote expired', {
      metaMessages: [
        `Expired at: ${expiresAt}`,
        `Current time: ${currentTime}`,
      ],
    })
    this.expiresAt = expiresAt
    this.currentTime = currentTime
  }
}

export class ExactOutputNotSupportedError extends ActionsError {
  override name = 'ExactOutputNotSupportedError' as const
  provider: string

  constructor(provider: string) {
    super(`${provider} does not support exact-output swaps`, {
      metaMessages: ['Provide amountIn instead of amountOut'],
    })
    this.provider = provider
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Address
// ─────────────────────────────────────────────────────────────────────────────

export class ZeroAddressError extends ActionsError {
  override name = 'ZeroAddressError' as const
  label: string
  address?: string

  constructor(label: string, address?: string) {
    super(`${label} cannot be the zero address`, {
      metaMessages: address ? [`Address: ${address}`] : undefined,
    })
    this.label = label
    this.address = address
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Slippage
// ─────────────────────────────────────────────────────────────────────────────

export class SlippageOutOfRangeError extends ActionsError {
  override name = 'SlippageOutOfRangeError' as const
  slippage: number
  maxSlippage: number

  constructor(slippage: number, maxSlippage: number) {
    super(`Slippage ${slippage} is out of range`, {
      metaMessages: [`Allowed range: [0, ${maxSlippage * 100}%]`],
    })
    this.slippage = slippage
    this.maxSlippage = maxSlippage
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Asset
// ─────────────────────────────────────────────────────────────────────────────

export class AssetNotSupportedOnChainError extends ActionsError {
  override name = 'AssetNotSupportedOnChainError' as const
  symbol: string
  chainId: number

  constructor(symbol: string, chainId: number) {
    super(`Asset ${symbol} is not supported on chain ${chainId}`)
    this.symbol = symbol
    this.chainId = chainId
  }
}

export class NativeAssetAddressError extends ActionsError {
  override name = 'NativeAssetAddressError' as const
  symbol: string

  constructor(symbol: string) {
    super(`${symbol} is a native asset and has no contract address`)
    this.symbol = symbol
  }
}

export class AssetMetadataRequiredError extends ActionsError {
  override name = 'AssetMetadataRequiredError' as const
  context?: string

  constructor(context?: string) {
    super('Asset metadata is required', {
      metaMessages: context ? [context] : undefined,
    })
    this.context = context
  }
}

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

  constructor(params: {
    chainId: number
    supportedChainIds?: readonly number[]
  }) {
    super(`Chain ${params.chainId} is not supported`, {
      metaMessages: params.supportedChainIds?.length
        ? [`Supported chains: ${params.supportedChainIds.join(', ')}`]
        : undefined,
    })
    this.chainId = params.chainId
    this.supportedChainIds = params.supportedChainIds ?? []
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

export class MarketNotFoundError extends ActionsError {
  override name = 'MarketNotFoundError' as const
  chainId: number
  poolId?: string

  constructor(params: { chainId: number; poolId?: string; reason?: string }) {
    super(
      params.poolId
        ? `Market with poolId ${params.poolId} not found on chain ${params.chainId}`
        : `Market not found on chain ${params.chainId}`,
      { metaMessages: params.reason ? [params.reason] : undefined },
    )
    this.chainId = params.chainId
    this.poolId = params.poolId
  }
}

export class ProviderNotConfiguredError extends ActionsError {
  override name = 'ProviderNotConfiguredError' as const
  provider: string

  constructor(params: { provider: string; details?: string }) {
    super(`A '${params.provider}' provider is not configured`, {
      metaMessages: params.details ? [params.details] : undefined,
    })
    this.provider = params.provider
  }
}

export class ProtocolContractsNotConfiguredError extends ActionsError {
  override name = 'ProtocolContractsNotConfiguredError' as const
  protocol: string
  chainId: number

  constructor(params: { protocol: string; chainId: number }) {
    super(
      `${params.protocol} contracts are not configured for chain ${params.chainId}`,
    )
    this.protocol = params.protocol
    this.chainId = params.chainId
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

  constructor(params: { expiresAt: number; currentTime: number }) {
    super('Quote expired', {
      metaMessages: [
        `Expired at: ${params.expiresAt}`,
        `Current time: ${params.currentTime}`,
      ],
    })
    this.expiresAt = params.expiresAt
    this.currentTime = params.currentTime
  }
}

/**
 * Thrown when a borrow market's configured `marketId` does not match the
 * keccak256 of its configured `MarketParams`.
 * @description Surfaced at provider construction so misconfigured deployments
 * fail fast instead of producing silently incorrect calldata.
 */
export class BorrowMarketParamsMismatchError extends ActionsError {
  override name = 'BorrowMarketParamsMismatchError' as const
  marketId: string
  computedMarketId: string

  constructor(params: { marketId: string; computedMarketId: string }) {
    super('Borrow market params do not match the configured marketId', {
      metaMessages: [
        `Configured marketId: ${params.marketId}`,
        `Computed from params: ${params.computedMarketId}`,
      ],
    })
    this.marketId = params.marketId
    this.computedMarketId = params.computedMarketId
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

export class AddressRequiredError extends ActionsError {
  override name = 'AddressRequiredError' as const
  label: string

  constructor(label: string) {
    super(`${label} is required`)
    this.label = label
  }
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Generic input validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when a caller-supplied parameter does not match the expected shape
 * (wrong type, empty when non-empty is required, etc.). The `expected` string
 * documents the type signature the caller should have produced.
 */
export class InvalidParamsError extends ActionsError {
  override name = 'InvalidParamsError' as const
  param: string
  expected: string
  received?: string

  constructor(params: { param: string; expected: string; received?: string }) {
    super(`Invalid params: ${params.param}`, {
      metaMessages: [
        `Expected: ${params.expected}`,
        ...(params.received ? [`Received: ${params.received}`] : []),
      ],
    })
    this.param = params.param
    this.expected = params.expected
    this.received = params.received
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quote
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown when a pre-built quote (swap, borrow, …) is dispatched against a
 * wallet whose address differs from the quote's `recipient`. Some routers
 * (Velodrome v2/leaf) and protocols (Morpho `supplyCollateral` / `borrow` /
 * `repay` / `withdrawCollateral`) encode the recipient or `onBehalf` address
 * directly into calldata, so silently swapping recipients would route assets
 * or position changes to the wrong account.
 */
export class QuoteRecipientMismatchError extends ActionsError {
  override name = 'QuoteRecipientMismatchError' as const
  quoteRecipient: string
  walletAddress: string

  constructor(params: { quoteRecipient: string; walletAddress: string }) {
    super(
      `Quote was generated for a different recipient (${params.quoteRecipient}); re-quote so calldata is bound to this wallet (${params.walletAddress})`,
    )
    this.quoteRecipient = params.quoteRecipient
    this.walletAddress = params.walletAddress
  }
}

/**
 * Thrown when a provider's `_getQuote` returns a quote without a `recipient`.
 * The base namespace requires every quote to be wallet-bound before approvals
 * or calldata are built.
 */
export class QuoteRecipientMissingError extends ActionsError {
  override name = 'QuoteRecipientMissingError' as const

  constructor() {
    super('Quote.recipient missing. _getQuote must populate it')
  }
}

/**
 * Thrown when a `{ max: true }` repay / close / withdraw is requested against
 * a position that has no debt (for repay/close) or no collateral (for
 * withdraw). Without this guard the SDK would emit a 0-amount on-chain call
 * that protocols like Morpho revert as `InconsistentInput`.
 */
export class EmptyPositionError extends ActionsError {
  override name = 'EmptyPositionError' as const
  operation: 'repay' | 'closePosition' | 'withdrawCollateral'

  constructor(params: {
    operation: 'repay' | 'closePosition' | 'withdrawCollateral'
  }) {
    const subject =
      params.operation === 'withdrawCollateral' ? 'collateral' : 'debt'
    super(
      `Cannot ${params.operation} with max amount: position has no ${subject}`,
    )
    this.operation = params.operation
  }
}

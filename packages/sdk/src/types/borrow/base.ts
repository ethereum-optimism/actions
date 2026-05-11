import type { Address, Hex } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type {
  ApprovalMode,
  BorrowProviderName,
  LendProviderName,
} from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type { TransactionOptions } from '@/types/common/index.js'
import type { TransactionData } from '@/types/transaction.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

/**
 * Identifier for a borrow market.
 * @description Tagged union designed to grow as additional protocols ship.
 * PR #3 only carries the Morpho Blue variant; Aave / Comet / Liquity / Euler
 * variants will land alongside their respective providers without breaking
 * existing callers.
 */
export type BorrowMarketId = {
  kind: 'morpho-blue'
  /** keccak256 hash of MarketParams; Morpho Blue's canonical market id */
  marketId: Hex
  /** Chain the market is deployed on */
  chainId: SupportedChainId
}

/**
 * Morpho Blue market parameter struct.
 * @description Mirrors the `MarketParams` struct in `IMorpho.sol`. The
 * keccak256 of the abi-encoded tuple is the Morpho Blue `marketId`.
 */
export interface MorphoMarketParams {
  /** Token that can be borrowed from this market */
  loanToken: Address
  /** Token deposited as collateral */
  collateralToken: Address
  /** Oracle providing the loan/collateral price */
  oracle: Address
  /** Interest rate model address */
  irm: Address
  /** Liquidation loan-to-value, WAD-scaled (1e18 = 100%) */
  lltv: bigint
}

/**
 * Metadata fields shared across every borrow market variant.
 * @description Combined with the protocol-specific tag/params to form
 * `BorrowMarketConfig`.
 */
export interface BorrowMarketConfigMetadata {
  /** Human-readable market name */
  name: string
  /** Asset deposited as collateral */
  collateralAsset: Asset
  /** Asset borrowed from the market */
  borrowAsset: Asset
  /** Borrow provider that services this market */
  borrowProvider: BorrowProviderName
  /**
   * Lend provider that issues the collateral token, when collateral is a
   * yield-bearing receipt (e.g. a Morpho vault share). Informational; lets
   * frontends coordinate cross-namespace flows.
   */
  lendProvider: LendProviderName
  /**
   * Optional per-market override for `BorrowSettings.healthBufferPct`
   * (Decision 7). Frontends use the resolved value to compute the
   * safe-ceiling LTV; not enforced by the SDK.
   */
  healthBufferPct?: number
}

/**
 * Discriminated config describing a single borrow market.
 * @description Each variant pairs a `BorrowMarketId` with the protocol-specific
 * configuration the provider needs to build calldata and read state.
 */
export type BorrowMarketConfig = BorrowMarketId &
  BorrowMarketConfigMetadata & {
    kind: 'morpho-blue'
    /**
     * Full Morpho Blue market parameters. Persisted alongside `marketId` so
     * the provider can encode write-side calldata without an extra RPC.
     */
    marketParams: MorphoMarketParams
  }

/**
 * Public information about a borrow market.
 * @description Returned from `actions.borrow.getMarket` /
 * `actions.borrow.getMarkets`. Frontends consume this directly.
 */
export interface BorrowMarket {
  /** Market identifier */
  marketId: BorrowMarketId
  /** Human-readable market name */
  name: string
  /** Collateral asset */
  collateralAsset: Asset
  /** Borrow asset */
  borrowAsset: Asset
  /** Current borrow APY as a decimal fraction (e.g. 0.045 = 4.5%) */
  borrowApy: number
  /** Liquidation bonus paid to liquidators as a decimal (e.g. 0.05 = 5%) */
  liquidationBonus: number
  /** Liquidation LTV (LLTV) as a decimal fraction */
  maxLtv: number
  /** Total assets currently borrowed from the market (wei) */
  totalBorrowed: bigint
  /** Total collateral supplied to the market (wei) */
  totalCollateral: bigint
}

/**
 * A wallet's position in a borrow market.
 * @description Both raw bigint and pre-formatted strings are surfaced so
 * frontends can render without re-deriving decimal scaling.
 */
export interface BorrowMarketPosition {
  /** Market identifier */
  marketId: BorrowMarketId
  /** Collateral asset metadata */
  collateralAsset: Asset
  /** Collateral balance in wei */
  collateralAmount: bigint
  /** Pre-formatted collateral balance */
  collateralAmountFormatted: string
  /** Borrow asset metadata */
  borrowAsset: Asset
  /** Accrued debt in wei (loan asset units) */
  borrowAmount: bigint
  /** Pre-formatted accrued debt */
  borrowAmountFormatted: string
  /**
   * Health factor as a decimal. `null` when no debt is outstanding;
   * `null` rather than `Infinity` keeps the type JSON-serializable.
   */
  healthFactor: number | null
  /** Collateral price (in loan-asset units) at which the position liquidates */
  liquidationPrice: bigint
  /** Pre-formatted liquidation price */
  liquidationPriceFormatted: string
  /** Current borrow APY snapshot (fraction) */
  borrowApy: number
  /** Liquidation bonus (fraction) */
  liquidationBonus: number
  /** Current LTV as a fraction. `null` when no debt is outstanding. */
  ltv: number | null
  /** Liquidation LTV as a fraction */
  maxLtv: number
}

/**
 * Amount input variant (#379 convention).
 * @description Exactly one of `amount` (human-readable) or `amountRaw`
 * (wei bigint) must be provided.
 */
export type Amount = { amount: number } | { amountRaw: bigint }

/**
 * Amount input variant that may opt into the protocol's full-balance path.
 * @description `{ max: true }` resolves at dispatch time to the live
 * on-chain balance; this avoids dust left behind by interest accrual on
 * full repays / closes.
 */
export type AmountOrMax = Amount | { max: true }

/**
 * Shared base for every borrow action's public params.
 * @description Concrete action params extend this with their amount fields.
 */
export interface BorrowOpenPositionBaseParams {
  /** Market to operate against */
  market: BorrowMarketConfig
  /**
   * Wallet performing the action. Auto-injected by `WalletBorrowNamespace`;
   * required when calling the base provider directly.
   */
  walletAddress?: Address
  /** Optional per-call transaction-level overrides */
  options?: TransactionOptions
  /**
   * Override the wallet-level approval-amount strategy for this call.
   * Falls back to `BorrowSettings.approvalMode` and finally to `"exact"`.
   */
  approvalMode?: ApprovalMode
}

/**
 * Params for opening or topping up a borrow position.
 * @description `borrowAmount` is required (the loan side of the action);
 * `collateralAmount` is optional, allowing a user to borrow against
 * previously deposited collateral.
 */
export type BorrowOpenPositionParams = BorrowOpenPositionBaseParams & {
  /** Amount to borrow from the market */
  borrowAmount: Amount
  /** Collateral to deposit alongside the borrow */
  collateralAmount?: Amount
}

/**
 * Params for unwinding a borrow position.
 * @description Symmetric inverse of `openPosition`. Both amounts accept
 * `{ max: true }` for dust-free full close.
 */
export type BorrowClosePositionParams = BorrowOpenPositionBaseParams & {
  /** Debt to repay; pass `{ max: true }` for a full repay */
  borrowAmount: AmountOrMax
  /** Collateral to withdraw; omit to leave collateral on the position */
  collateralAmount?: AmountOrMax
}

/** Params for depositing additional collateral without changing debt. */
export type BorrowDepositCollateralParams = BorrowOpenPositionBaseParams & {
  amount: Amount
}

/** Params for withdrawing collateral. `{ max: true }` withdraws the full balance. */
export type BorrowWithdrawCollateralParams = BorrowOpenPositionBaseParams & {
  amount: AmountOrMax
}

/** Params for repaying debt without touching collateral. */
export type BorrowRepayParams = BorrowOpenPositionBaseParams & {
  amount: AmountOrMax
}

/**
 * Discriminator for the action a quote / receipt represents.
 */
export type BorrowAction =
  | 'open'
  | 'close'
  | 'depositCollateral'
  | 'withdrawCollateral'
  | 'repay'

/**
 * Fee context for a borrow action.
 * @description Required fields apply to every protocol PR #3 ships. The
 * forward-looking `originationFee` slot has been dropped per YAGNI; it
 * will be reintroduced when a protocol that charges upfront fees ships
 * (e.g. Liquity).
 */
export interface BorrowFees {
  /** Current borrow APY as a decimal (e.g. 0.045 = 4.5%) */
  borrowApy: number
  /** Liquidator discount as a decimal (e.g. 0.05 = 5%) */
  liquidationBonus: number
}

/**
 * Pre-built calldata bundle attached to a borrow quote.
 */
export interface BorrowQuoteExecution {
  /**
   * Ordered transaction bundle (`[approve?, collateral?, primary]`). Marked
   * `readonly` so consumers can't mutate a frozen quote.
   */
  transactions: readonly TransactionData[]
  /**
   * `true` when existing on-chain allowance covered the bundle and no
   * approval transaction was prepended.
   */
  approvalsSkipped?: boolean
}

/**
 * A complete borrow quote: position transitions, fees, safe-ceiling LTV,
 * and a pre-built transaction bundle ready to submit on-chain.
 * @description Mirrors swap's `SwapQuote` shape. Pass the quote back into
 * the matching `wallet.borrow.*` method to dispatch without re-quoting.
 */
export interface BorrowQuote {
  /** Market the quote targets */
  marketId: BorrowMarketId
  /** Action the quote represents */
  action: BorrowAction
  /** Echo of the borrow-side input amount (display) */
  borrowAmount?: number
  /** Echo of the borrow-side input amount (raw) */
  borrowAmountRaw?: bigint
  /** Echo of the collateral-side input amount (display) */
  collateralAmount?: number
  /** Echo of the collateral-side input amount (raw) */
  collateralAmountRaw?: bigint
  /**
   * Position state immediately before the action. `null` when opening
   * a fresh position.
   */
  positionBefore: BorrowMarketPosition | null
  /** Position state after the action lands on-chain */
  positionAfter: BorrowMarketPosition
  /** Fee context at quote time */
  fees: BorrowFees
  /**
   * Buffer-aware safe ceiling (`maxLtv * (1 - healthBufferPct)`).
   * UX recommendation only; consumers gate explicitly by checking
   * `positionAfter.ltv > safeCeilingLtv`.
   */
  safeCeilingLtv: number
  /** Pre-built transaction bundle */
  execution: BorrowQuoteExecution
  /** Provider that produced the quote */
  provider: BorrowProviderName
  /**
   * Recipient baked into the quote's calldata. `WalletBorrowNamespace`
   * binds this to `wallet.address`; mismatched executors must re-quote.
   */
  recipient: Address
  /** Unix seconds when the quote was generated */
  quotedAt: number
  /** Unix seconds when the quote expires */
  expiresAt: number
  /** Optional gas estimate for the bundle (raw wei) */
  gasEstimate?: bigint
}

/**
 * Lightweight quote alternative for previews that don't need calldata.
 */
export interface BorrowPrice {
  /** Market the preview targets */
  marketId: BorrowMarketId
  /** Action the preview represents */
  action: BorrowAction
  /** Hypothetical post-action position state */
  positionAfter: BorrowMarketPosition
  /** Fee context at preview time */
  fees: BorrowFees
  /** Buffer-aware safe ceiling */
  safeCeilingLtv: number
}

/** Filter parameters for `actions.borrow.getMarkets`. */
export interface GetBorrowMarketsParams {
  /** Filter to markets whose `collateralAsset` matches */
  collateralAsset?: Asset
  /** Filter to markets whose `borrowAsset` matches */
  borrowAsset?: Asset
  /** Filter to markets on a specific chain */
  chainId?: SupportedChainId
  /** Pre-filtered market configs (used internally by the provider) */
  markets?: BorrowMarketConfig[]
}

/** Identifier params for `actions.borrow.getMarket`. */
export type GetBorrowMarketParams = BorrowMarketId

/** Params for `actions.borrow.getPosition`. */
export interface GetBorrowPositionParams {
  marketId: BorrowMarketId
  walletAddress: Address
}

/**
 * Receipt returned after dispatching a borrow action.
 */
export interface BorrowReceipt {
  /** Underlying transaction receipt(s) */
  receipt: TransactionReturnType | BatchTransactionReturnType
  /** Action that was executed */
  action: BorrowAction
  /** Realized borrow-side amount in wei */
  borrowAmount?: bigint
  /** Realized collateral-side amount in wei */
  collateralAmount?: bigint
  /** Market the receipt corresponds to */
  marketId: BorrowMarketId
  /** Position snapshot taken after the action lands, when available */
  positionAfter?: BorrowMarketPosition
}

/**
 * Internal amount representation after the base normalizes user input.
 * @description `{ max: true }` is preserved through to the provider so it
 * can re-fetch live balance at bundle-build time and avoid dust.
 */
export type AmountWeiOrMax = { amountWei: bigint } | { max: true }

/**
 * Base shape for internal params handed to provider `_*` hooks.
 * @description Recipient is resolved by the namespace (defaults to
 * `walletAddress`); approval mode is resolved by the abstract base.
 */
export interface BorrowInternalBaseParams {
  market: BorrowMarketConfig
  walletAddress: Address
  recipient: Address
  options?: TransactionOptions
  /** Resolved approval-amount strategy (per-call → provider → settings → `"exact"`). */
  approvalMode: ApprovalMode
}

/** Internal params after `openPosition` amount normalization. */
export interface BorrowOpenPositionInternalParams extends BorrowInternalBaseParams {
  borrowAmountWei: bigint
  collateralAmountWei?: bigint
}

/** Internal params after `closePosition` amount normalization. */
export interface BorrowClosePositionInternalParams extends BorrowInternalBaseParams {
  borrowAmount: AmountWeiOrMax
  collateralAmount?: AmountWeiOrMax
}

/** Internal params after `depositCollateral` amount normalization. */
export interface BorrowDepositCollateralInternalParams extends BorrowInternalBaseParams {
  amountWei: bigint
}

/** Internal params after `withdrawCollateral` amount normalization. */
export interface BorrowWithdrawCollateralInternalParams extends BorrowInternalBaseParams {
  amount: AmountWeiOrMax
}

/** Internal params after `repay` amount normalization. */
export interface BorrowRepayInternalParams extends BorrowInternalBaseParams {
  amount: AmountWeiOrMax
}

/**
 * Provider-level borrow configuration.
 * @description Mirrors `LendProviderConfig`. Provider-level fields override
 * the shared `BorrowSettings`; per-call params override the provider.
 */
export interface BorrowProviderConfig {
  /** Allowlist of markets available through this provider */
  marketAllowlist?: BorrowMarketConfig[]
  /** Blocklist of markets to exclude */
  marketBlocklist?: BorrowMarketConfig[]
  /** Approval-amount strategy override (overrides `BorrowSettings.approvalMode`) */
  approvalMode?: ApprovalMode
  /** Quote expiration in seconds (overrides `BorrowSettings.quoteExpirationSeconds`) */
  quoteExpirationSeconds?: number
}

/**
 * Abstract method signatures every borrow provider implementation must
 * supply. Mirrors the `LendProviderMethods` pattern.
 */
export interface BorrowProviderMethods {
  _openPosition(params: BorrowOpenPositionInternalParams): Promise<BorrowQuote>
  _closePosition(
    params: BorrowClosePositionInternalParams,
  ): Promise<BorrowQuote>
  _depositCollateral(
    params: BorrowDepositCollateralInternalParams,
  ): Promise<BorrowQuote>
  _withdrawCollateral(
    params: BorrowWithdrawCollateralInternalParams,
  ): Promise<BorrowQuote>
  _repay(params: BorrowRepayInternalParams): Promise<BorrowQuote>
  _getPosition(params: GetBorrowPositionParams): Promise<BorrowMarketPosition>
  _getMarket(marketId: BorrowMarketId): Promise<BorrowMarket>
  _getMarkets(params: GetBorrowMarketsParams): Promise<BorrowMarket[]>
}

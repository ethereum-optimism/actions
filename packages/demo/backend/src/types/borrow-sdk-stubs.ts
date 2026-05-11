/**
 * TEMPORARY: SDK type stubs for the borrow surface.
 *
 * PR #3 (kevin/borrow-pr3) ships the real types in `@eth-optimism/actions-sdk`.
 * Until then, backend code imports from this file so it compiles against the
 * shape locked in PR #3 brainstorm v2 (`docs/brainstorms/2026-05-08-borrow-pr3-
 * sdk-borrow-provider-brainstorm.md` on `kevin/borrow-pr3`).
 *
 * When PR #3 lands, replace every `from '@/types/borrow-sdk-stubs.js'` with
 * `from '@eth-optimism/actions-sdk'` and delete this file.
 */

import type { Asset, SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Address, Hex } from 'viem'

// ---------- Identity ----------

export type BorrowProviderName = 'morpho' // | 'aave' when PR #6 lands
export type LendProviderName = 'morpho' | 'aave'

export type BorrowMarketId = {
  kind: 'morpho-blue'
  marketId: Hex
  chainId: SupportedChainId
}

// ---------- Market config ----------

export type BorrowMarketConfig = BorrowMarketId & {
  name: string
  collateralAsset: Asset
  borrowAsset: Asset
  borrowProvider: BorrowProviderName
  lendProvider: LendProviderName
  healthBufferPct?: number
}

// ---------- Position ----------

export interface BorrowMarketPosition {
  marketId: BorrowMarketId
  collateralAsset: Asset
  collateralAmount: bigint
  collateralAmountFormatted: string
  borrowAsset: Asset
  borrowAmount: bigint
  borrowAmountFormatted: string
  healthFactor: number // 1.0 = at liquidation; Infinity if no debt
  liquidationPrice: bigint // USD, in collateralAsset's price decimals
  liquidationPriceFormatted: string
  borrowApy: number // fraction
  liquidationBonus: number // fraction
  ltv?: number
  maxLtv?: number
}

// ---------- Market (read shape) ----------

export interface BorrowMarket {
  marketId: BorrowMarketId
  collateralAsset: Asset
  borrowAsset: Asset
  totalSupply: bigint
  totalBorrow: bigint
  availableLiquidity: bigint
  utilization: number
  maxLtv: number
  liquidationLtv: number
  borrowApy: number
  liquidationBonus: number
}

// ---------- Amount shape (per PR #3 Decision 3 / issue #379) ----------

export type AmountExact = { amount: number } | { amountRaw: bigint }
export type AmountWithMax = AmountExact | { max: true }

// ---------- Method params ----------

export interface GetBorrowMarketsParams {
  collateralAsset?: Asset
  borrowAsset?: Asset
  chainId?: SupportedChainId
  markets?: BorrowMarketConfig[]
}

export interface GetBorrowPositionParams {
  marketId: BorrowMarketId
  walletAddress: Address
}

export interface OpenPositionParams {
  marketId: BorrowMarketId
  borrowAmount: AmountExact
  collateralAmount?: AmountExact
  collateralAsset?: Address
}

export interface ClosePositionParams {
  marketId: BorrowMarketId
  borrowAmount: AmountWithMax
  collateralAmount?: AmountWithMax
}

export interface DepositCollateralParams {
  marketId: BorrowMarketId
  amount: AmountExact
}

export interface WithdrawCollateralParams {
  marketId: BorrowMarketId
  amount: AmountWithMax
}

export interface RepayParams {
  marketId: BorrowMarketId
  amount: AmountWithMax
}

// ---------- Quote / price ----------

export type BorrowAction =
  | 'open'
  | 'close'
  | 'depositCollateral'
  | 'withdrawCollateral'
  | 'repay'

export interface BorrowFees {
  borrowApy: number
  liquidationBonus: number
  originationFee?: {
    amount: number
    amountRaw: bigint
    asset: Asset
    description: string
  }
}

export interface TxRequest {
  to: Address
  data: Hex
  value?: bigint
  chainId?: SupportedChainId
}

export interface BorrowQuote {
  marketId: BorrowMarketId
  action: BorrowAction
  borrowAmount?: number
  borrowAmountRaw?: bigint
  collateralAmount?: number
  collateralAmountRaw?: bigint
  positionBefore: BorrowMarketPosition | null
  positionAfter: BorrowMarketPosition
  fees: BorrowFees
  safeCeilingLtv: number
  execution: { transactions: TxRequest[] }
  provider: BorrowProviderName
  recipient: Address
  quotedAt: number
  expiresAt: number
  gasEstimate?: bigint
}

export interface BorrowPrice {
  marketId: BorrowMarketId
  action: BorrowAction
  positionAfter: BorrowMarketPosition
  fees: BorrowFees
  safeCeilingLtv: number
}

export interface GetBorrowPriceParams {
  action: BorrowAction
  marketId: BorrowMarketId
  borrowAmount?: AmountExact
  collateralAmount?: AmountExact
  recipient?: Address
}

export interface GetBorrowQuoteParams {
  action: BorrowAction
  marketId: BorrowMarketId
  borrowAmount?: AmountExact
  collateralAmount?: AmountExact
  recipient: Address
}

// ---------- Receipt ----------

export interface BorrowReceipt {
  userOpHash?: Hex
  transactionHash?: Hex
  transactionHashes?: Hex[]
  marketId: BorrowMarketId
  action: BorrowAction
}

// ---------- Namespaces (runtime surface) ----------

export interface ActionsBorrowNamespace {
  getMarket(marketId: BorrowMarketId): Promise<BorrowMarket>
  getMarkets(params: GetBorrowMarketsParams): Promise<BorrowMarket[]>
  getPosition(params: GetBorrowPositionParams): Promise<BorrowMarketPosition>
  getPrice(params: GetBorrowPriceParams): Promise<BorrowPrice>
  getQuote(params: GetBorrowQuoteParams): Promise<BorrowQuote>
}

export interface WalletBorrowNamespace {
  openPosition(params: OpenPositionParams | BorrowQuote): Promise<BorrowReceipt>
  closePosition(
    params: ClosePositionParams | BorrowQuote,
  ): Promise<BorrowReceipt>
  depositCollateral(
    params: DepositCollateralParams | BorrowQuote,
  ): Promise<BorrowReceipt>
  withdrawCollateral(
    params: WithdrawCollateralParams | BorrowQuote,
  ): Promise<BorrowReceipt>
  repay(params: RepayParams | BorrowQuote): Promise<BorrowReceipt>
}

// ---------- Provider config (for createActions wiring) ----------

export interface BorrowProviderConfig {
  marketAllowlist: BorrowMarketConfig[]
}

export interface BorrowProviders {
  morpho?: BorrowProviderConfig
  // aave?: BorrowProviderConfig — PR #6
}

export interface BorrowSettings {
  healthBufferPct?: number // default 0.05
}

// ---------- Error class placeholders ----------

// These mirror the brainstorm-discussed SDK errors; final class names come from
// PR #3. The `mapSdkError` helper checks via `instanceof`, which works for the
// placeholders here just as well as for the real classes after the swap.

export class MarketNotAllowedError extends Error {
  override name = 'MarketNotAllowedError'
}
export class MarketNotFoundError extends Error {
  override name = 'MarketNotFoundError'
}
export class ChainNotSupportedError extends Error {
  override name = 'ChainNotSupportedError'
}
export class InsufficientLiquidityError extends Error {
  override name = 'InsufficientLiquidityError'
}
export class InsufficientCollateralError extends Error {
  override name = 'InsufficientCollateralError'
}
export class HealthFactorTooLowError extends Error {
  override name = 'HealthFactorTooLowError'
}
export class QuoteExpiredError extends Error {
  override name = 'QuoteExpiredError'
}
export class QuoteRecipientMismatchError extends Error {
  override name = 'QuoteRecipientMismatchError'
}
export class BorrowProviderNotConfiguredError extends Error {
  override name = 'BorrowProviderNotConfiguredError'
}

// ---------- SDK access wrappers (temporary; remove when PR #3 lands) ----------

/**
 * Accesses the borrow namespace on the SDK Actions singleton. Cast at one
 * spot so services don't repeat the assertion. When PR #3 lands, replace
 * the body with `return getActions().borrow`.
 */
export function asActionsBorrow(actions: unknown): ActionsBorrowNamespace {
  const candidate = (actions as { borrow?: ActionsBorrowNamespace }).borrow
  if (!candidate) {
    throw new BorrowProviderNotConfiguredError(
      'Borrow namespace not configured on Actions',
    )
  }
  return candidate
}

/**
 * Accesses the borrow namespace on a wallet. Cast at one spot. When PR #3
 * lands, the SDK's `Wallet` type will expose `borrow?: WalletBorrowNamespace`
 * directly and this helper becomes `return wallet.borrow`.
 */
export function asWalletBorrow(wallet: unknown): WalletBorrowNamespace {
  const candidate = (wallet as { borrow?: WalletBorrowNamespace }).borrow
  if (!candidate) {
    throw new BorrowProviderNotConfiguredError(
      'Borrow functionality not configured for this wallet',
    )
  }
  return candidate
}

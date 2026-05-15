/**
 * Borrow API client.
 *
 * Thin HTTP layer over the demo backend's `/borrow/*` and
 * `/wallet/borrow/*` routes. Shape mirrors `ActionsApiClient`
 * (api/actionsApi.ts): a class with a `request<T>` helper, per-method
 * `headers?: HeadersInit` for auth, and bigint deserialization at the
 * response boundary.
 *
 * Outbound bigints (e.g. `Amount.amountRaw`) ship as decimal strings;
 * the backend's `AmountExactSchema` / `AmountWithMaxSchema` accept the
 * string form. Inbound bigints (`collateralAmount`, `borrowAmount`,
 * `liquidationPrice`, `totalBorrowed`, `totalCollateral`,
 * `borrowAmountRaw`, `collateralAmountRaw`, `gasEstimate`) are parsed
 * back to `bigint` here so the rest of the frontend never deals with
 * the wire shape.
 *
 * `stubPriceUsd` is still exported as a temporary helper for the
 * frontend's projection math; it will go away when the Borrow tab
 * switches its preview to `borrowApi.getPrice()` (Task #3).
 */

import type { Address, Hex } from 'viem'
import type {
  Amount,
  AmountOrMax,
  BorrowMarket,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowPrice,
  BorrowQuote,
  BorrowReceipt,
} from '@eth-optimism/actions-sdk'
import { env } from '../envVars.js'
import type { Serialized } from '../util/serialize.js'

// Stub demo prices, retained until the projection math in
// `BorrowAction` is swapped over to `borrowApi.getPrice()` (Task #3).
// USDC = $1, OP = $0.10 mirrors the backend's demo oracle.
const STUB_PRICES_USD: Readonly<Record<string, number>> = {
  USDC: 1.0,
  USDC_DEMO: 1.0,
  OP: 0.1,
  OP_DEMO: 0.1,
  ETH: 3000,
  WETH: 3000,
}

export function stubPriceUsd(symbol: string): number {
  return (
    STUB_PRICES_USD[symbol] ?? STUB_PRICES_USD[symbol.replace('_DEMO', '')] ?? 0
  )
}

class BorrowApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'BorrowApiError'
    this.status = status
  }
}

// ---------- Param shapes ----------
// These mirror PR #3's `BorrowOpenPositionParams` etc., but reference
// the market via `BorrowMarketId` (the backend resolves the full
// `BorrowMarketConfig` server-side) so the frontend doesn't need to
// round-trip the market config.

export interface StubOpenParams {
  marketId: BorrowMarketId
  borrowAmount: Amount
  collateralAmount?: Amount
}

export interface StubCloseParams {
  marketId: BorrowMarketId
  borrowAmount: AmountOrMax
  collateralAmount?: AmountOrMax
}

export interface StubCollateralParams {
  marketId: BorrowMarketId
  amount: AmountOrMax
}

export interface StubRepayParams {
  marketId: BorrowMarketId
  amount: AmountOrMax
}

// Discriminated price/quote params matching the backend's
// `PriceQuoteBodySchema`. `walletAddress` is honored on `/borrow/price`
// only; `/borrow/quote` rejects it (derived from auth).
export type BorrowPriceParams =
  | {
      action: 'open'
      marketId: BorrowMarketId
      walletAddress?: Address
      borrowAmount: Amount
      collateralAmount?: Amount
    }
  | {
      action: 'close'
      marketId: BorrowMarketId
      walletAddress?: Address
      borrowAmount: AmountOrMax
      collateralAmount?: AmountOrMax
    }
  | {
      action: 'depositCollateral'
      marketId: BorrowMarketId
      walletAddress?: Address
      amount: Amount
    }
  | {
      action: 'withdrawCollateral'
      marketId: BorrowMarketId
      walletAddress?: Address
      amount: AmountOrMax
    }
  | {
      action: 'repay'
      marketId: BorrowMarketId
      walletAddress?: Address
      amount: AmountOrMax
    }

export type BorrowQuoteParams = BorrowPriceParams

function buildPriceBody(params: BorrowPriceParams): Record<string, unknown> {
  const base = {
    action: params.action,
    marketId: params.marketId,
    ...(params.walletAddress ? { walletAddress: params.walletAddress } : {}),
  }
  switch (params.action) {
    case 'open':
    case 'close':
      return {
        ...base,
        borrowAmount: params.borrowAmount,
        ...(params.collateralAmount
          ? { collateralAmount: params.collateralAmount }
          : {}),
      }
    case 'depositCollateral':
    case 'withdrawCollateral':
    case 'repay':
      return { ...base, amount: params.amount }
  }
}

// ---------- Serialization helpers ----------

function serializeBigInts<T>(value: T): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map((v) => serializeBigInts(v))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeBigInts(v)
    }
    return out
  }
  return value
}

function deserializeMarket(m: Serialized<BorrowMarket>): BorrowMarket {
  return {
    ...m,
    totalBorrowed: BigInt(m.totalBorrowed as unknown as string),
    totalCollateral: BigInt(m.totalCollateral as unknown as string),
  } as BorrowMarket
}

function deserializePosition(
  p: Serialized<BorrowMarketPosition>,
): BorrowMarketPosition {
  return {
    ...p,
    collateralShares: BigInt(p.collateralShares as unknown as string),
    collateralAmount: BigInt(p.collateralAmount as unknown as string),
    borrowAmount: BigInt(p.borrowAmount as unknown as string),
    liquidationPrice: BigInt(p.liquidationPrice as unknown as string),
  } as BorrowMarketPosition
}

function deserializePrice(p: Serialized<BorrowPrice>): BorrowPrice {
  return {
    ...p,
    positionAfter: deserializePosition(
      p.positionAfter as unknown as Serialized<BorrowMarketPosition>,
    ),
  } as BorrowPrice
}

function deserializeQuote(q: Serialized<BorrowQuote>): BorrowQuote {
  const positionBefore = q.positionBefore
    ? deserializePosition(
        q.positionBefore as unknown as Serialized<BorrowMarketPosition>,
      )
    : null
  const positionAfter = deserializePosition(
    q.positionAfter as unknown as Serialized<BorrowMarketPosition>,
  )
  return {
    ...q,
    positionBefore,
    positionAfter,
    borrowAmountRaw:
      q.borrowAmountRaw !== undefined && q.borrowAmountRaw !== null
        ? BigInt(q.borrowAmountRaw as unknown as string)
        : undefined,
    collateralAmountRaw:
      q.collateralAmountRaw !== undefined && q.collateralAmountRaw !== null
        ? BigInt(q.collateralAmountRaw as unknown as string)
        : undefined,
    gasEstimate:
      q.gasEstimate !== undefined && q.gasEstimate !== null
        ? BigInt(q.gasEstimate as unknown as string)
        : undefined,
  } as BorrowQuote
}

function deserializeReceipt(r: Serialized<BorrowReceipt>): BorrowReceipt {
  return {
    ...r,
    borrowAmount:
      r.borrowAmount !== undefined && r.borrowAmount !== null
        ? BigInt(r.borrowAmount as unknown as string)
        : undefined,
    collateralAmount:
      r.collateralAmount !== undefined && r.collateralAmount !== null
        ? BigInt(r.collateralAmount as unknown as string)
        : undefined,
    positionAfter: r.positionAfter
      ? deserializePosition(
          r.positionAfter as unknown as Serialized<BorrowMarketPosition>,
        )
      : undefined,
  } as BorrowReceipt
}

function marketIdPath(marketId: BorrowMarketId): string {
  if (marketId.kind === 'morpho-blue') {
    return `${marketId.chainId}/${encodeURIComponent(marketId.marketId)}`
  }
  throw new Error(`Unsupported borrow marketId.kind: ${marketId.kind}`)
}

// A position with zero collateral and zero debt is the backend's
// "no position" sentinel (the route always responds 200). The frontend
// expects `null` for that case so empty positions don't render as
// dust-y zero rows.
function isEmptyPosition(p: BorrowMarketPosition): boolean {
  return p.collateralAmount === 0n && p.borrowAmount === 0n
}

// ---------- Client ----------

export class BorrowApiClient {
  private baseUrl = env.VITE_ACTIONS_API_URL

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`
    const { headers, ...rest } = options

    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      ...rest,
    })

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorData.message || errorMessage
      } catch {
        // body wasn't JSON; keep the status-line message
      }
      throw new BorrowApiError(errorMessage, response.status)
    }

    return (await response.json()) as T
  }

  async getMarkets(
    headers: HeadersInit = {},
  ): Promise<readonly BorrowMarket[]> {
    const { result } = await this.request<{
      result: Serialized<BorrowMarket>[]
    }>('/borrow/markets', { method: 'GET', headers })
    return result.map(deserializeMarket)
  }

  async getPosition(
    _walletAddress: Address,
    marketId: BorrowMarketId,
    headers: HeadersInit = {},
  ): Promise<BorrowMarketPosition | null> {
    const { result } = await this.request<{
      result: Serialized<BorrowMarketPosition>
    }>(`/wallet/borrow/${marketIdPath(marketId)}/position`, {
      method: 'GET',
      headers,
    })
    const position = deserializePosition(result)
    return isEmptyPosition(position) ? null : position
  }

  async getPositions(
    walletAddress: Address,
    headers: HeadersInit = {},
  ): Promise<readonly BorrowMarketPosition[]> {
    // Backend has no list endpoint; fan out across known markets and
    // drop the zero-position responses.
    const markets = await this.getMarkets(headers)
    const positions = await Promise.all(
      markets.map((m) => this.getPosition(walletAddress, m.marketId, headers)),
    )
    return positions.filter((p): p is BorrowMarketPosition => p !== null)
  }

  // `/borrow/price` is a public route; auth headers are not required
  // but are forwarded when provided for parity with `actionsApi`. The
  // backend's body schema is a strict discriminated union keyed on
  // `action`, so the shape we ship must match the variant exactly.
  async getPrice(
    params: BorrowPriceParams,
    headers: HeadersInit = {},
  ): Promise<BorrowPrice> {
    const body = serializeBigInts(buildPriceBody(params))
    const { result } = await this.request<{ result: Serialized<BorrowPrice> }>(
      '/borrow/price',
      { method: 'POST', body: JSON.stringify(body), headers },
    )
    return deserializePrice(result)
  }

  // `walletAddress` is rejected by the backend; derived from auth.
  async getQuote(
    params: BorrowQuoteParams,
    headers: HeadersInit = {},
  ): Promise<BorrowQuote> {
    const body = serializeBigInts(buildPriceBody(params))
    const { result } = await this.request<{ result: Serialized<BorrowQuote> }>(
      '/borrow/quote',
      { method: 'POST', body: JSON.stringify(body), headers },
    )
    return deserializeQuote(result)
  }

  // ---------- Mutations ----------

  async openPosition(
    _walletAddress: Address,
    params: StubOpenParams,
    headers: HeadersInit = {},
  ): Promise<BorrowReceipt> {
    return this.postMutation('/borrow/position/open', params, headers)
  }

  async closePosition(
    _walletAddress: Address,
    params: StubCloseParams,
    headers: HeadersInit = {},
  ): Promise<BorrowReceipt> {
    return this.postMutation('/borrow/position/close', params, headers)
  }

  async depositCollateral(
    _walletAddress: Address,
    params: StubCollateralParams,
    headers: HeadersInit = {},
  ): Promise<BorrowReceipt> {
    return this.postMutation(
      '/borrow/position/deposit-collateral',
      params,
      headers,
    )
  }

  async withdrawCollateral(
    _walletAddress: Address,
    params: StubCollateralParams,
    headers: HeadersInit = {},
  ): Promise<BorrowReceipt> {
    return this.postMutation(
      '/borrow/position/withdraw-collateral',
      params,
      headers,
    )
  }

  async repay(
    _walletAddress: Address,
    params: StubRepayParams,
    headers: HeadersInit = {},
  ): Promise<BorrowReceipt> {
    return this.postMutation('/borrow/position/repay', params, headers)
  }

  private async postMutation(
    endpoint: string,
    params: object,
    headers: HeadersInit,
  ): Promise<BorrowReceipt> {
    const body = serializeBigInts(params)
    const { result } = await this.request<{
      result: Serialized<BorrowReceipt>
    }>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
      headers,
    })
    return deserializeReceipt(result)
  }
}

export const borrowApi = new BorrowApiClient()
export { BorrowApiError }

// Re-export Hex for callers building tx-hash placeholders elsewhere
// (kept for backwards source compatibility with the prior mock).
export type { Hex }

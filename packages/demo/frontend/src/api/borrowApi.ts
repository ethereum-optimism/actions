/**
 * Mock borrow API client.
 *
 * Mirrors the shape of `ActionsApiClient` (api/actionsApi.ts) but resolves
 * promises against in-memory state instead of fetching the backend. When
 * PR #4 lands, swap the body of each method for a `request<T>` against the
 * real `/borrow/*` endpoints (see PR #4 brainstorm for the surface). The
 * exported `borrowApi` singleton import-site stays identical.
 *
 * Pricing is hardcoded (USDC = $1, OP = $0.10) so the mock can compute
 * `healthFactor`, `ltv`, and `safeCeilingLtv` for `BorrowMarketPosition` /
 * `BorrowQuote` / `BorrowPrice` without an oracle.
 */

import type { Address, Hex } from 'viem'
import { BORROW_HEALTH_BUFFER_PCT } from '@/config/borrow'
import { ALL_BORROW_MARKETS } from '@/constants/borrowMarkets'
import { computeHealthFactor, computeSafeCeilingLtv } from '@/utils/borrowMath'
import type {
  AmountExact,
  AmountWithMax,
  BorrowAction,
  BorrowCloseParams,
  BorrowCollateralParams,
  BorrowFees,
  BorrowMarket,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowOpenParams,
  BorrowPrice,
  BorrowQuote,
  BorrowRepayParams,
  BorrowTransactionReceipt,
} from '@/types/borrow'

// Stub demo prices. Real backend gets these from on-chain oracles.
// Exported so the frontend's projection math (in BorrowAction) can read
// the same numbers the stub computes against without duplication.
// TODO(PR #4): replace consumer reads of stubPriceUsd with
// borrowProviderContext.getPrice() responses that carry positionAfter
// from the real backend.
const STUB_PRICES_USD: Readonly<Record<string, number>> = {
  USDC: 1.0,
  USDC_DEMO: 1.0,
  OP: 0.1,
  OP_DEMO: 0.1,
  ETH: 3000,
  WETH: 3000,
}

const STUB_LATENCY_MS = 600
const STUB_QUOTE_TTL_MS = 30_000

export function stubPriceUsd(symbol: string): number {
  return (
    STUB_PRICES_USD[symbol] ?? STUB_PRICES_USD[symbol.replace('_DEMO', '')] ?? 0
  )
}

function priceForSymbol(symbol: string): number {
  return stubPriceUsd(symbol)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function rawToHuman(raw: bigint, decimals: number): number {
  // Lossy by design: USD aggregates and display values are always lossy.
  const divisor = 10 ** decimals
  return Number(raw) / divisor
}

function humanToRaw(human: number, decimals: number): bigint {
  if (!Number.isFinite(human) || human <= 0) return 0n
  return BigInt(Math.floor(human * 10 ** decimals))
}

function resolveAmount(amount: AmountExact, decimals: number): bigint {
  if ('amountRaw' in amount) return amount.amountRaw
  return humanToRaw(amount.amount, decimals)
}

function resolveAmountWithMax(
  amount: AmountWithMax,
  decimals: number,
  maxFallback: bigint,
): bigint {
  if ('max' in amount) return maxFallback
  return resolveAmount(amount, decimals)
}

function sameMarketId(a: BorrowMarketId, b: BorrowMarketId): boolean {
  if (a.kind !== b.kind) return false
  if (a.chainId !== b.chainId) return false
  if (a.kind === 'morpho-blue' && b.kind === 'morpho-blue') {
    return a.marketId === b.marketId
  }
  return false
}

function findMarket(id: BorrowMarketId): BorrowMarket | undefined {
  return ALL_BORROW_MARKETS.find((m) => sameMarketId(m.marketId, id))
}

function walletKey(address: Address): string {
  return address.toLowerCase()
}

function buildPosition(
  market: BorrowMarket,
  collateralAmount: bigint,
  borrowAmount: bigint,
): BorrowMarketPosition {
  const collDec = market.collateralAsset.metadata.decimals
  const borrDec = market.borrowAsset.metadata.decimals

  const collHuman = rawToHuman(collateralAmount, collDec)
  const borrHuman = rawToHuman(borrowAmount, borrDec)
  const collPrice = priceForSymbol(market.collateralAsset.metadata.symbol)
  const borrPrice = priceForSymbol(market.borrowAsset.metadata.symbol)

  const collateralValueUsd = collHuman * collPrice
  const borrowValueUsd = borrHuman * borrPrice

  const currentLtv =
    collateralValueUsd > 0 ? borrowValueUsd / collateralValueUsd : 0
  const healthFactor = computeHealthFactor(
    collateralValueUsd,
    market.maxLtv,
    borrowValueUsd,
  )

  // Liquidation price: price of the borrow asset at which the position
  // would be liquidated, holding collateral constant. For OP/USDC:
  //   liq when borrowValue == collateralValue * maxLtv
  //   => borrPrice == (collValueUsd * maxLtv) / borrAmountHuman
  const liqPriceHuman =
    borrHuman > 0
      ? (collateralValueUsd * market.maxLtv) / borrHuman
      : Number.POSITIVE_INFINITY
  // PR #3 specifies `liquidationPrice: bigint` (USD, in collateralAsset
  // price decimals). For the stub we standardize on 6 decimals.
  const liquidationPrice = Number.isFinite(liqPriceHuman)
    ? BigInt(Math.round(liqPriceHuman * 1e6))
    : 0n

  return {
    marketId: market.marketId,
    collateralAsset: market.collateralAsset,
    collateralAmount,
    collateralAmountFormatted: collHuman.toString(),
    borrowAsset: market.borrowAsset,
    borrowAmount,
    borrowAmountFormatted: borrHuman.toString(),
    healthFactor,
    liquidationPrice,
    liquidationPriceFormatted: Number.isFinite(liqPriceHuman)
      ? liqPriceHuman.toFixed(4)
      : 'never',
    borrowApy: market.borrowApy,
    liquidationBonus: market.liquidationBonus,
    ltv: currentLtv,
    maxLtv: market.maxLtv,
  }
}

function resolveBufferPct(market: BorrowMarket): number {
  return market.healthBufferPct ?? BORROW_HEALTH_BUFFER_PCT
}

function placeholderTxHash(): Hex {
  // Deterministic enough for a stub.
  const rand = Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, '0')
  return `0x${rand.padStart(64, '0')}` as Hex
}

export class BorrowApiClient {
  // walletKey -> positions
  private readonly positionsByWallet = new Map<string, BorrowMarketPosition[]>()

  async getMarkets(): Promise<readonly BorrowMarket[]> {
    await delay(STUB_LATENCY_MS)
    return ALL_BORROW_MARKETS
  }

  async getPositions(
    walletAddress: Address,
  ): Promise<readonly BorrowMarketPosition[]> {
    await delay(STUB_LATENCY_MS)
    return this.positionsByWallet.get(walletKey(walletAddress)) ?? []
  }

  async getPosition(
    walletAddress: Address,
    marketId: BorrowMarketId,
  ): Promise<BorrowMarketPosition | null> {
    const positions = await this.getPositions(walletAddress)
    return positions.find((p) => sameMarketId(p.marketId, marketId)) ?? null
  }

  /**
   * Reset all in-memory state for a wallet. Called by the provider
   * context on wallet switch to mirror queryClient.clear() behavior.
   */
  resetWallet(walletAddress: Address): void {
    this.positionsByWallet.delete(walletKey(walletAddress))
  }

  // ---------- Read: price + quote ----------

  async getPrice(params: {
    action: BorrowAction
    marketId: BorrowMarketId
    walletAddress: Address
    borrowAmount?: AmountExact | { max: true }
    collateralAmount?: AmountExact | { max: true }
  }): Promise<BorrowPrice> {
    const market = findMarket(params.marketId)
    if (!market) throw new Error('Market not found')
    const before = await this.getPosition(params.walletAddress, params.marketId)
    const after = this.simulate(market, before, params)
    return {
      marketId: market.marketId,
      action: params.action,
      positionAfter: after,
      fees: {
        borrowApy: market.borrowApy,
        liquidationBonus: market.liquidationBonus,
      },
      safeCeilingLtv: computeSafeCeilingLtv(
        market.maxLtv,
        resolveBufferPct(market),
      ),
    }
  }

  async getQuote(params: {
    action: BorrowAction
    marketId: BorrowMarketId
    walletAddress: Address
    recipient: Address
    borrowAmount?: AmountExact | { max: true }
    collateralAmount?: AmountExact | { max: true }
  }): Promise<BorrowQuote> {
    const market = findMarket(params.marketId)
    if (!market) throw new Error('Market not found')
    const before = await this.getPosition(params.walletAddress, params.marketId)
    const after = this.simulate(market, before, params)
    const fees: BorrowFees = {
      borrowApy: market.borrowApy,
      liquidationBonus: market.liquidationBonus,
    }
    const now = Date.now()
    return {
      marketId: market.marketId,
      action: params.action,
      borrowAmount:
        params.borrowAmount &&
        !('max' in params.borrowAmount) &&
        'amount' in params.borrowAmount
          ? params.borrowAmount.amount
          : undefined,
      borrowAmountRaw:
        params.borrowAmount &&
        !('max' in params.borrowAmount) &&
        'amountRaw' in params.borrowAmount
          ? params.borrowAmount.amountRaw
          : undefined,
      collateralAmount:
        params.collateralAmount &&
        !('max' in params.collateralAmount) &&
        'amount' in params.collateralAmount
          ? params.collateralAmount.amount
          : undefined,
      collateralAmountRaw:
        params.collateralAmount &&
        !('max' in params.collateralAmount) &&
        'amountRaw' in params.collateralAmount
          ? params.collateralAmount.amountRaw
          : undefined,
      positionBefore: before,
      positionAfter: after,
      fees,
      safeCeilingLtv: computeSafeCeilingLtv(
        market.maxLtv,
        resolveBufferPct(market),
      ),
      execution: { transactions: [] },
      provider: market.borrowProvider,
      recipient: params.recipient,
      quotedAt: now,
      expiresAt: now + STUB_QUOTE_TTL_MS,
    }
  }

  // ---------- Mutations ----------

  async openPosition(
    walletAddress: Address,
    params: BorrowOpenParams,
  ): Promise<BorrowTransactionReceipt> {
    const market = findMarket(params.marketId)
    if (!market) throw new Error('Market not found')
    const before =
      (await this.getPosition(walletAddress, params.marketId)) ?? null

    const collateralDelta = params.collateralAmount
      ? resolveAmount(
          params.collateralAmount,
          market.collateralAsset.metadata.decimals,
        )
      : 0n
    const borrowDelta = resolveAmount(
      params.borrowAmount,
      market.borrowAsset.metadata.decimals,
    )

    const nextCollateral = (before?.collateralAmount ?? 0n) + collateralDelta
    const nextBorrow = (before?.borrowAmount ?? 0n) + borrowDelta

    const next = buildPosition(market, nextCollateral, nextBorrow)
    this.upsertPosition(walletAddress, next)
    return this.successReceipt()
  }

  async closePosition(
    walletAddress: Address,
    params: BorrowCloseParams,
  ): Promise<BorrowTransactionReceipt> {
    const market = findMarket(params.marketId)
    if (!market) throw new Error('Market not found')
    const before = await this.getPosition(walletAddress, params.marketId)
    if (!before) throw new Error('No position to close')

    const repayRaw = resolveAmountWithMax(
      params.borrowAmount,
      market.borrowAsset.metadata.decimals,
      before.borrowAmount,
    )
    const withdrawRaw = params.collateralAmount
      ? resolveAmountWithMax(
          params.collateralAmount,
          market.collateralAsset.metadata.decimals,
          before.collateralAmount,
        )
      : 0n

    const nextBorrow =
      repayRaw >= before.borrowAmount ? 0n : before.borrowAmount - repayRaw
    const nextCollateral =
      withdrawRaw >= before.collateralAmount
        ? 0n
        : before.collateralAmount - withdrawRaw

    if (nextBorrow === 0n && nextCollateral === 0n) {
      this.deletePosition(walletAddress, params.marketId)
    } else {
      const next = buildPosition(market, nextCollateral, nextBorrow)
      this.upsertPosition(walletAddress, next)
    }
    return this.successReceipt()
  }

  async depositCollateral(
    walletAddress: Address,
    params: BorrowCollateralParams,
  ): Promise<BorrowTransactionReceipt> {
    const market = findMarket(params.marketId)
    if (!market) throw new Error('Market not found')
    const before = await this.getPosition(walletAddress, params.marketId)
    const baseCollateral = before?.collateralAmount ?? 0n
    const delta = resolveAmountWithMax(
      params.amount,
      market.collateralAsset.metadata.decimals,
      baseCollateral,
    )
    const next = buildPosition(
      market,
      baseCollateral + delta,
      before?.borrowAmount ?? 0n,
    )
    this.upsertPosition(walletAddress, next)
    return this.successReceipt()
  }

  async withdrawCollateral(
    walletAddress: Address,
    params: BorrowCollateralParams,
  ): Promise<BorrowTransactionReceipt> {
    const market = findMarket(params.marketId)
    if (!market) throw new Error('Market not found')
    const before = await this.getPosition(walletAddress, params.marketId)
    if (!before) throw new Error('No position to withdraw from')
    const delta = resolveAmountWithMax(
      params.amount,
      market.collateralAsset.metadata.decimals,
      before.collateralAmount,
    )
    const nextCollateral =
      delta >= before.collateralAmount ? 0n : before.collateralAmount - delta
    if (nextCollateral === 0n && before.borrowAmount === 0n) {
      this.deletePosition(walletAddress, params.marketId)
    } else {
      const next = buildPosition(market, nextCollateral, before.borrowAmount)
      this.upsertPosition(walletAddress, next)
    }
    return this.successReceipt()
  }

  async repay(
    walletAddress: Address,
    params: BorrowRepayParams,
  ): Promise<BorrowTransactionReceipt> {
    const market = findMarket(params.marketId)
    if (!market) throw new Error('Market not found')
    const before = await this.getPosition(walletAddress, params.marketId)
    if (!before) throw new Error('No position to repay')
    const delta = resolveAmountWithMax(
      params.amount,
      market.borrowAsset.metadata.decimals,
      before.borrowAmount,
    )
    const nextBorrow =
      delta >= before.borrowAmount ? 0n : before.borrowAmount - delta
    if (nextBorrow === 0n && before.collateralAmount === 0n) {
      this.deletePosition(walletAddress, params.marketId)
    } else {
      const next = buildPosition(market, before.collateralAmount, nextBorrow)
      this.upsertPosition(walletAddress, next)
    }
    return this.successReceipt()
  }

  // ---------- Internal ----------

  private simulate(
    market: BorrowMarket,
    before: BorrowMarketPosition | null,
    params: {
      action: BorrowAction
      borrowAmount?: AmountExact | { max: true }
      collateralAmount?: AmountExact | { max: true }
    },
  ): BorrowMarketPosition {
    const collDec = market.collateralAsset.metadata.decimals
    const borrDec = market.borrowAsset.metadata.decimals
    let coll = before?.collateralAmount ?? 0n
    let borr = before?.borrowAmount ?? 0n

    const collDelta = params.collateralAmount
      ? resolveAmountWithMax(params.collateralAmount, collDec, coll)
      : 0n
    const borrDelta = params.borrowAmount
      ? resolveAmountWithMax(params.borrowAmount, borrDec, borr)
      : 0n

    switch (params.action) {
      case 'open':
        coll += collDelta
        borr += borrDelta
        break
      case 'close':
        coll = collDelta >= coll ? 0n : coll - collDelta
        borr = borrDelta >= borr ? 0n : borr - borrDelta
        break
      case 'depositCollateral':
        coll += collDelta
        break
      case 'withdrawCollateral':
        coll = collDelta >= coll ? 0n : coll - collDelta
        break
      case 'repay':
        borr = borrDelta >= borr ? 0n : borr - borrDelta
        break
    }
    return buildPosition(market, coll, borr)
  }

  private upsertPosition(
    walletAddress: Address,
    position: BorrowMarketPosition,
  ): void {
    const key = walletKey(walletAddress)
    const list = this.positionsByWallet.get(key) ?? []
    const idx = list.findIndex((p) =>
      sameMarketId(p.marketId, position.marketId),
    )
    const next =
      idx >= 0
        ? list.map((p, i) => (i === idx ? position : p))
        : [...list, position]
    this.positionsByWallet.set(key, next)
  }

  private deletePosition(
    walletAddress: Address,
    marketId: BorrowMarketId,
  ): void {
    const key = walletKey(walletAddress)
    const list = this.positionsByWallet.get(key) ?? []
    this.positionsByWallet.set(
      key,
      list.filter((p) => !sameMarketId(p.marketId, marketId)),
    )
  }

  private async successReceipt(): Promise<BorrowTransactionReceipt> {
    await delay(STUB_LATENCY_MS)
    return {
      status: 'success',
      transactionHash: placeholderTxHash(),
    }
  }
}

export const borrowApi = new BorrowApiClient()

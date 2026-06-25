import type {
  Asset,
  BorrowAction,
  BorrowMarket,
  BorrowMarketId,
  BorrowMarketPosition,
  BorrowProviderName,
  LendAction,
  LendMarket,
  LendMarketPosition,
  LendProviderName,
  PriceQuote,
  SupportedChainId,
  SwapMarket,
  TokenBalance,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

import { writeJson } from '@/output/json.js'
import { isJsonMode } from '@/output/mode.js'
import type { WalletTransactionReceipt } from '@/utils/receipts.js'

function writeLine(line = ''): void {
  process.stdout.write(line + '\n')
}

export interface ChainRow {
  chainId: SupportedChainId
  shortname: string
  rpcUrls?: string[]
}

export interface AddressDoc {
  address: string
}

export interface LendActionDoc {
  action: LendAction
  market: {
    name: string
    address: Address
    chainId: SupportedChainId
    provider: LendProviderName
  }
  asset: { symbol: string }
  amount: number
  transactions: readonly WalletTransactionReceipt[]
}

/**
 * @description Per-leg amounts embedded in a `BorrowActionDoc`. `'max'` is
 * surfaced verbatim (the SDK's full-balance path) so agents can tell a
 * literal 0 borrow from a max-resolve. Both legs are optional because every
 * verb only touches one or two of them: `repay` reports `borrowAmount`,
 * `deposit-collateral` reports `collateralAmount`, `open` / `close` report
 * both.
 */
export interface BorrowEnvelopeAmounts {
  borrowAmount?: number | 'max'
  collateralAmount?: number | 'max'
}

/**
 * @description Output envelope for the wallet-scoped borrow write verbs. The
 * `market.marketId` field is the full `BorrowMarketId` discriminated union
 * (not just a hex string) so a future second provider variant (Aave, Comet)
 * with different discriminator fields surfaces without breaking consumers.
 * `positionAfter` highlights (`ltv`, `healthFactor`,
 * `liquidationPriceFormatted`) are decorated onto the envelope so an agent
 * has health context without a second `getPosition` call; they're optional
 * because the SDK only surfaces them when the provider produced a
 * `positionAfter` snapshot.
 */
export interface BorrowActionDoc extends BorrowEnvelopeAmounts {
  action: BorrowAction
  market: {
    name: string
    marketId: BorrowMarketId
    chainId: SupportedChainId
    provider: BorrowProviderName
  }
  transactions: readonly WalletTransactionReceipt[]
  ltv?: number | null
  healthFactor?: number | null
  liquidationPriceFormatted?: string
}

export interface SwapExecuteDoc {
  action: 'execute'
  assetIn: { symbol: string }
  assetOut: { symbol: string }
  amountIn: number
  amountOut: number
  amountInRaw: bigint
  amountOutRaw: bigint
  price: number
  priceImpact: number
  transactions: readonly WalletTransactionReceipt[]
}

interface Printers {
  assets: readonly Asset[]
  chains: readonly ChainRow[]
  address: AddressDoc
  balance: readonly TokenBalance[]
  lendAction: LendActionDoc
  lendMarkets: readonly LendMarket[]
  lendMarket: LendMarket
  lendPosition: LendMarketPosition
  borrowAction: BorrowActionDoc
  borrowMarkets: readonly BorrowMarket[]
  borrowMarket: BorrowMarket
  borrowPosition: BorrowMarketPosition
  swapMarkets: readonly SwapMarket[]
  swapMarket: SwapMarket
  swapQuote: PriceQuote
  swapQuotes: readonly PriceQuote[]
  swapExecute: SwapExecuteDoc
}

function formatAssets(assets: Printers['assets']): void {
  if (assets.length === 0) {
    writeLine('(no assets configured)')
    return
  }
  for (const asset of assets) {
    const { symbol, name, decimals } = asset.metadata
    writeLine(`${symbol.padEnd(12)} ${name} (${decimals}d, ${asset.type})`)
  }
}

function formatChains(rows: Printers['chains']): void {
  if (rows.length === 0) {
    writeLine('(no chains configured)')
    return
  }
  for (const row of rows) {
    const rpc = row.rpcUrls?.length ? ` rpc=${row.rpcUrls.join(',')}` : ''
    writeLine(`${row.shortname.padEnd(18)} ${row.chainId}${rpc}`)
  }
}

function formatAddress(doc: Printers['address']): void {
  writeLine(doc.address)
}

function formatBalance(balances: Printers['balance']): void {
  if (balances.length === 0) {
    writeLine('(no balances)')
    return
  }
  for (const tb of balances) {
    const { symbol } = tb.asset.metadata
    writeLine(`${symbol}  total=${tb.totalBalance}`)
    const chainIds = Object.keys(tb.chains)
    if (chainIds.length === 0) {
      writeLine(`  (no chain breakdown)`)
      continue
    }
    for (const cid of chainIds) {
      const entry = tb.chains[cid as unknown as SupportedChainId]
      if (!entry) continue
      writeLine(
        `  chain=${cid} balance=${entry.balance} raw=${entry.balanceRaw}`,
      )
    }
  }
}

const LEND_ACTION_VERBS = {
  open: 'opened',
  close: 'closed',
} as const satisfies Record<LendActionDoc['action'], string>

function formatReceiptList(txs: readonly WalletTransactionReceipt[]): void {
  for (const tx of txs) {
    if ('transactionHash' in tx) {
      writeLine(`  tx=${tx.transactionHash} status=${tx.status}`)
    } else {
      const userOpHash = (tx as { userOpHash?: string }).userOpHash ?? '?'
      const success = (tx as { success?: boolean }).success
      writeLine(`  userOp=${userOpHash} success=${success}`)
    }
  }
}

function formatLendAction(doc: LendActionDoc): void {
  const verb = LEND_ACTION_VERBS[doc.action]
  writeLine(
    `${verb} position: ${doc.amount} ${doc.asset.symbol} on ${doc.market.name} (${doc.market.provider}, chain ${doc.market.chainId})`,
  )
  formatReceiptList(doc.transactions)
}

function formatLendMarket(m: LendMarket): void {
  writeLine(
    `${m.name}  symbol=${m.asset.metadata.symbol} chain=${m.marketId.chainId} apy=${(m.apy.total * 100).toFixed(2)}%`,
  )
  writeLine(`  address=${m.marketId.address}`)
  writeLine(
    `  totalAssets=${m.supply.totalAssets} totalShares=${m.supply.totalShares}`,
  )
}

function formatLendMarkets(markets: readonly LendMarket[]): void {
  if (markets.length === 0) {
    writeLine('(no markets)')
    return
  }
  for (const m of markets) formatLendMarket(m)
}

function formatLendPosition(p: LendMarketPosition): void {
  writeLine(
    `position: balance=${p.balanceFormatted} shares=${p.sharesFormatted} chain=${p.marketId.chainId}`,
  )
  writeLine(
    `  market=${p.marketId.address} balanceWei=${p.balance} sharesRaw=${p.shares}`,
  )
}

const BORROW_ACTION_VERBS = {
  open: 'opened',
  close: 'closed',
  depositCollateral: 'deposited collateral on',
  withdrawCollateral: 'withdrew collateral from',
  repay: 'repaid',
} as const satisfies Record<BorrowActionDoc['action'], string>

function fmtAmount(value: number | 'max' | undefined): string | undefined {
  if (value === undefined) return undefined
  return value === 'max' ? 'max' : String(value)
}

function formatBorrowAction(doc: BorrowActionDoc): void {
  const verb = BORROW_ACTION_VERBS[doc.action]
  const parts: string[] = []
  const borrow = fmtAmount(doc.borrowAmount)
  const collateral = fmtAmount(doc.collateralAmount)
  if (borrow !== undefined) parts.push(`borrow=${borrow}`)
  if (collateral !== undefined) parts.push(`collateral=${collateral}`)
  const amounts = parts.length > 0 ? ` (${parts.join(' ')})` : ''
  writeLine(
    `${verb} ${doc.market.name}${amounts} on ${doc.market.provider} (chain ${doc.market.chainId})`,
  )
  if (
    doc.ltv !== undefined ||
    doc.healthFactor !== undefined ||
    doc.liquidationPriceFormatted !== undefined
  ) {
    const ltv = doc.ltv == null ? 'n/a' : doc.ltv.toFixed(4)
    const hf = doc.healthFactor == null ? 'n/a' : doc.healthFactor.toFixed(4)
    const liq = doc.liquidationPriceFormatted ?? 'n/a'
    writeLine(`  ltv=${ltv} healthFactor=${hf} liquidationPrice=${liq}`)
  }
  formatReceiptList(doc.transactions)
}

function formatBorrowMarket(m: BorrowMarket): void {
  const collat = m.collateralAsset.metadata.symbol
  const borrow = m.borrowAsset.metadata.symbol
  writeLine(
    `${m.name}  ${collat}/${borrow} chain=${m.marketId.chainId} borrowApy=${(m.borrowApy * 100).toFixed(2)}%`,
  )
  writeLine(
    `  marketId=${m.marketId.marketId} maxLtv=${(m.maxLtv * 100).toFixed(2)}% liquidationBonus=${(m.liquidationBonus * 100).toFixed(2)}%`,
  )
  writeLine(
    `  totalBorrowed=${m.totalBorrowed} totalCollateral=${m.totalCollateral}`,
  )
}

function formatBorrowMarkets(markets: readonly BorrowMarket[]): void {
  if (markets.length === 0) {
    writeLine('(no markets)')
    return
  }
  for (const m of markets) formatBorrowMarket(m)
}

function formatBorrowPosition(p: BorrowMarketPosition): void {
  const collat = p.collateralAsset.metadata.symbol
  const borrow = p.borrowAsset.metadata.symbol
  writeLine(
    `position: collateral=${p.collateralShares} shares (${collat}) debt=${p.borrowAmountFormatted} ${borrow} chain=${p.marketId.chainId}`,
  )
  const ltv = p.ltv == null ? 'n/a' : p.ltv.toFixed(4)
  const hf = p.healthFactor == null ? 'n/a' : p.healthFactor.toFixed(4)
  writeLine(
    `  ltv=${ltv} maxLtv=${p.maxLtv.toFixed(4)} healthFactor=${hf} liquidationPrice=${p.liquidationPriceFormatted}`,
  )
  writeLine(
    `  borrowApy=${(p.borrowApy * 100).toFixed(2)}% liquidationBonus=${(p.liquidationBonus * 100).toFixed(2)}%`,
  )
}

function formatSwapMarket(m: SwapMarket): void {
  const [a, b] = m.assets
  writeLine(
    `${a.metadata.symbol}/${b.metadata.symbol}  pool=${m.marketId.poolId} chain=${m.marketId.chainId} provider=${m.provider} fee=${m.fee}`,
  )
}

function formatSwapMarkets(markets: readonly SwapMarket[]): void {
  if (markets.length === 0) {
    writeLine('(no markets)')
    return
  }
  for (const m of markets) formatSwapMarket(m)
}

function formatSwapQuote(q: PriceQuote): void {
  writeLine(
    `${q.amountIn} ${q.assetIn.metadata.symbol} -> ${q.amountOut} ${q.assetOut.metadata.symbol} (provider=${q.provider}, chain=${q.chainId})`,
  )
  writeLine(
    `  price=${q.price} priceImpact=${(q.priceImpact * 100).toFixed(3)}% slippage=${(q.slippage * 100).toFixed(3)}%`,
  )
  writeLine(`  amountOutMin=${q.amountOutMin} expiresAt=${q.expiresAt}`)
}

function formatSwapQuotes(quotes: readonly PriceQuote[]): void {
  if (quotes.length === 0) {
    writeLine('(no quotes)')
    return
  }
  for (const q of quotes) formatSwapQuote(q)
}

function formatSwapExecute(doc: SwapExecuteDoc): void {
  writeLine(
    `swapped ${doc.amountIn} ${doc.assetIn.symbol} for ${doc.amountOut} ${doc.assetOut.symbol} (price=${doc.price})`,
  )
  formatReceiptList(doc.transactions)
}

const TEXT_FORMATTERS: {
  [K in keyof Printers]: (data: Printers[K]) => void
} = {
  assets: formatAssets,
  chains: formatChains,
  address: formatAddress,
  balance: formatBalance,
  lendAction: formatLendAction,
  lendMarkets: formatLendMarkets,
  lendMarket: formatLendMarket,
  lendPosition: formatLendPosition,
  borrowAction: formatBorrowAction,
  borrowMarkets: formatBorrowMarkets,
  borrowMarket: formatBorrowMarket,
  borrowPosition: formatBorrowPosition,
  swapMarkets: formatSwapMarkets,
  swapMarket: formatSwapMarket,
  swapQuote: formatSwapQuote,
  swapQuotes: formatSwapQuotes,
  swapExecute: formatSwapExecute,
}

/**
 * @description Single stdout sink for command output. In JSON mode emits
 * the raw document via `writeJson` (bigint-aware, pretty-printed). In
 * text mode dispatches to the per-kind human formatter. Command handlers
 * should call this and never format or write to stdout themselves.
 * @param kind - Command output discriminator.
 * @param data - The typed payload for that kind.
 */
export function printOutput<K extends keyof Printers>(
  kind: K,
  data: Printers[K],
): void {
  if (isJsonMode()) {
    writeJson(data)
    return
  }
  TEXT_FORMATTERS[kind](data)
}

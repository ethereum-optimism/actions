import type {
  Asset,
  EOATransactionReceipt,
  LendMarket,
  LendMarketPosition,
  SupportedChainId,
  SwapMarket,
  SwapQuote,
  TokenBalance,
  UserOperationTransactionReceipt,
} from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

import { writeJson } from '@/output/json.js'
import { isJsonMode } from '@/output/mode.js'

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
  action: 'open' | 'close'
  market: {
    name: string
    address: Address
    chainId: SupportedChainId
    provider: string
  }
  asset: { symbol: string }
  amount: number
  transactions: ReadonlyArray<
    EOATransactionReceipt | UserOperationTransactionReceipt
  >
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
  transactions: ReadonlyArray<
    EOATransactionReceipt | UserOperationTransactionReceipt
  >
}

interface Printers {
  assets: readonly Asset[]
  chains: readonly ChainRow[]
  address: AddressDoc
  balance: readonly TokenBalance[]
  lendOpen: LendActionDoc
  lendClose: LendActionDoc
  lendMarkets: readonly LendMarket[]
  lendMarket: LendMarket
  lendPosition: LendMarketPosition
  swapMarkets: readonly SwapMarket[]
  swapMarket: SwapMarket
  swapQuote: SwapQuote
  swapQuotes: readonly SwapQuote[]
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

function formatLendAction(doc: LendActionDoc): void {
  const verb = doc.action === 'open' ? 'opened' : 'closed'
  writeLine(
    `${verb} position: ${doc.amount} ${doc.asset.symbol} on ${doc.market.name} (${doc.market.provider}, chain ${doc.market.chainId})`,
  )
  for (const tx of doc.transactions) {
    if ('transactionHash' in tx) {
      writeLine(`  tx=${tx.transactionHash} status=${tx.status}`)
    } else {
      const userOpHash = (tx as { userOpHash?: string }).userOpHash ?? '?'
      const success = (tx as { success?: boolean }).success
      writeLine(`  userOp=${userOpHash} success=${success}`)
    }
  }
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

function formatSwapQuote(q: SwapQuote): void {
  writeLine(
    `${q.amountIn} ${q.assetIn.metadata.symbol} -> ${q.amountOut} ${q.assetOut.metadata.symbol} (provider=${q.provider}, chain=${q.chainId})`,
  )
  writeLine(
    `  price=${q.price} priceImpact=${(q.priceImpact * 100).toFixed(3)}% slippage=${(q.slippage * 100).toFixed(3)}%`,
  )
  writeLine(`  amountOutMin=${q.amountOutMin} expiresAt=${q.expiresAt}`)
}

function formatSwapQuotes(quotes: readonly SwapQuote[]): void {
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
  for (const tx of doc.transactions) {
    if ('transactionHash' in tx) {
      writeLine(`  tx=${tx.transactionHash} status=${tx.status}`)
    } else {
      const userOpHash = (tx as { userOpHash?: string }).userOpHash ?? '?'
      const success = (tx as { success?: boolean }).success
      writeLine(`  userOp=${userOpHash} success=${success}`)
    }
  }
}

const TEXT_FORMATTERS: {
  [K in keyof Printers]: (data: Printers[K]) => void
} = {
  assets: formatAssets,
  chains: formatChains,
  address: formatAddress,
  balance: formatBalance,
  lendOpen: formatLendAction,
  lendClose: formatLendAction,
  lendMarkets: formatLendMarkets,
  lendMarket: formatLendMarket,
  lendPosition: formatLendPosition,
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

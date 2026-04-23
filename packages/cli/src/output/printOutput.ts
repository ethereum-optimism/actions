import type {
  Asset,
  SupportedChainId,
  TokenBalance,
} from '@eth-optimism/actions-sdk'

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

interface Printers {
  assets: readonly Asset[]
  chains: readonly ChainRow[]
  address: AddressDoc
  balance: readonly TokenBalance[]
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

const TEXT_FORMATTERS: {
  [K in keyof Printers]: (data: Printers[K]) => void
} = {
  assets: formatAssets,
  chains: formatChains,
  address: formatAddress,
  balance: formatBalance,
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

import type { ActivityEntry } from '@/providers/ActivityLogProvider'

export type SummarySegment =
  | { type: 'text'; value: string }
  | { type: 'token'; logo: string; symbol: string; round?: boolean }

export interface ActivitySummary {
  segments: SummarySegment[]
}

function displaySymbol(symbol: string): string {
  return symbol.replace('_DEMO', '')
}

const SYMBOL_LOGO: Record<string, string> = {
  USDC_DEMO: '/usd-coin-usdc-logo.svg',
  USDC: '/usd-coin-usdc-logo.svg',
  ETH: '/eth.svg',
  OP_DEMO: '/OP.svg',
  OP: '/OP.svg',
}

const MARKET_LOGO: Record<string, string> = {
  Morpho: '/morpho-logo.svg',
  Aave: '/aave-logo.svg',
}

function tokenSegment(symbol: string, logo?: string): SummarySegment {
  const resolved =
    logo || SYMBOL_LOGO[symbol] || SYMBOL_LOGO[displaySymbol(symbol)]
  if (resolved) {
    return {
      type: 'token',
      logo: resolved,
      symbol: displaySymbol(symbol),
      round: true,
    }
  }
  return { type: 'text', value: displaySymbol(symbol) }
}

function marketSegment(name: string): SummarySegment {
  const logo = MARKET_LOGO[name]
  if (logo) {
    return { type: 'token', logo, symbol: name, round: false }
  }
  return { type: 'text', value: name }
}

function buildSwapSummary(entry: ActivityEntry): SummarySegment[] {
  const m = entry.metadata
  if (m?.amount && m.assetSymbol && m.amountOut && m.assetOutSymbol) {
    return [
      { type: 'text', value: `Swapped ${m.amount} ` },
      tokenSegment(m.assetSymbol, m.assetLogo),
      { type: 'text', value: ` → ${m.amountOut} ` },
      tokenSegment(m.assetOutSymbol, m.assetOutLogo),
    ]
  }
  return [{ type: 'text', value: 'Swapped tokens' }]
}

function buildDepositSummary(entry: ActivityEntry): SummarySegment[] {
  const m = entry.metadata
  if (m?.amount && m.assetSymbol) {
    const segments: SummarySegment[] = [
      { type: 'text', value: `Lent ${m.amount} ` },
      tokenSegment(m.assetSymbol, m.assetLogo),
    ]
    if (m.marketName) {
      segments.push({ type: 'text', value: ' to ' })
      segments.push(marketSegment(m.marketName))
    }
    return segments
  }
  return [{ type: 'text', value: 'Lent ' }, tokenSegment('USDC')]
}

function buildWithdrawSummary(entry: ActivityEntry): SummarySegment[] {
  const m = entry.metadata
  if (m?.amount && m.assetSymbol) {
    const segments: SummarySegment[] = [
      { type: 'text', value: `Withdrew ${m.amount} ` },
      tokenSegment(m.assetSymbol, m.assetLogo),
    ]
    if (m.marketName) {
      segments.push({ type: 'text', value: ' from ' })
      segments.push(marketSegment(m.marketName))
    }
    return segments
  }
  return [{ type: 'text', value: 'Withdrew ' }, tokenSegment('USDC')]
}

function buildMintSummary(entry: ActivityEntry): SummarySegment[] {
  const m = entry.metadata
  if (m?.assetSymbol) {
    return [
      { type: 'text', value: 'Minted ' },
      tokenSegment(m.assetSymbol, m.assetLogo),
    ]
  }
  return [{ type: 'text', value: 'Minted ' }, tokenSegment('USDC')]
}

const SUMMARY_BUILDERS: Record<
  string,
  (entry: ActivityEntry) => SummarySegment[]
> = {
  swap: buildSwapSummary,
  deposit: buildDepositSummary,
  withdraw: buildWithdrawSummary,
  mint: buildMintSummary,
  create: () => [{ type: 'text', value: 'Created wallet' }],
  createHosted: () => [{ type: 'text', value: 'Created hosted wallet' }],
}

export function getActivitySummary(entry: ActivityEntry): ActivitySummary {
  const builder = SUMMARY_BUILDERS[entry.action]
  if (builder) {
    return { segments: builder(entry) }
  }

  const typeLabel =
    entry.type === 'lend'
      ? 'Lend'
      : entry.type === 'withdraw'
        ? 'Withdraw'
        : entry.type === 'fund'
          ? 'Fund'
          : entry.type === 'swap'
            ? 'Swap'
            : 'Wallet'

  return {
    segments: [{ type: 'text', value: `${typeLabel}: ${entry.action}` }],
  }
}

export function isSignedTransaction(entry: ActivityEntry): boolean {
  return !!entry.blockExplorerUrl
}

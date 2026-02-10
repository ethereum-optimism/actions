import type { ActivityEntry } from '@/providers/ActivityLogProvider'

export type SummarySegment =
  | { type: 'text'; value: string }
  | { type: 'token'; logo: string; symbol: string }

export interface ActivitySummary {
  segments: SummarySegment[]
}

function displaySymbol(symbol: string): string {
  return symbol.replace('_DEMO', '')
}

function buildSwapSummary(entry: ActivityEntry): SummarySegment[] {
  const m = entry.metadata
  if (m?.amount && m.assetSymbol && m.amountOut && m.assetOutSymbol) {
    return [
      { type: 'text', value: `Swapped ${m.amount} ` },
      ...(m.assetLogo
        ? [
            {
              type: 'token' as const,
              logo: m.assetLogo,
              symbol: displaySymbol(m.assetSymbol),
            },
          ]
        : [{ type: 'text' as const, value: displaySymbol(m.assetSymbol) }]),
      { type: 'text', value: ` → ${m.amountOut} ` },
      ...(m.assetOutLogo
        ? [
            {
              type: 'token' as const,
              logo: m.assetOutLogo,
              symbol: displaySymbol(m.assetOutSymbol),
            },
          ]
        : [
            {
              type: 'text' as const,
              value: displaySymbol(m.assetOutSymbol),
            },
          ]),
    ]
  }
  return [{ type: 'text', value: 'Swapped tokens' }]
}

function buildDepositSummary(entry: ActivityEntry): SummarySegment[] {
  const m = entry.metadata
  if (m?.amount && m.assetSymbol) {
    const segments: SummarySegment[] = [
      { type: 'text', value: `Lent ${m.amount} ` },
      ...(m.assetLogo
        ? [
            {
              type: 'token' as const,
              logo: m.assetLogo,
              symbol: displaySymbol(m.assetSymbol),
            },
          ]
        : [{ type: 'text' as const, value: displaySymbol(m.assetSymbol) }]),
    ]
    if (m.marketName) {
      segments.push({ type: 'text', value: ` to ${m.marketName}` })
    }
    return segments
  }
  return [
    { type: 'text', value: 'Lent ' },
    { type: 'token', logo: '/usdc-logo.svg', symbol: 'USDC' },
  ]
}

function buildWithdrawSummary(entry: ActivityEntry): SummarySegment[] {
  const m = entry.metadata
  if (m?.amount && m.assetSymbol) {
    const segments: SummarySegment[] = [
      { type: 'text', value: `Withdrew ${m.amount} ` },
      ...(m.assetLogo
        ? [
            {
              type: 'token' as const,
              logo: m.assetLogo,
              symbol: displaySymbol(m.assetSymbol),
            },
          ]
        : [{ type: 'text' as const, value: displaySymbol(m.assetSymbol) }]),
    ]
    if (m.marketName) {
      segments.push({ type: 'text', value: ` from ${m.marketName}` })
    }
    return segments
  }
  return [
    { type: 'text', value: 'Withdrew ' },
    { type: 'token', logo: '/usdc-logo.svg', symbol: 'USDC' },
  ]
}

function buildMintSummary(entry: ActivityEntry): SummarySegment[] {
  const m = entry.metadata
  if (m?.assetSymbol) {
    return [
      { type: 'text', value: 'Minted ' },
      ...(m.assetLogo
        ? [
            {
              type: 'token' as const,
              logo: m.assetLogo,
              symbol: displaySymbol(m.assetSymbol),
            },
          ]
        : [{ type: 'text' as const, value: displaySymbol(m.assetSymbol) }]),
    ]
  }
  return [
    { type: 'text', value: 'Minted ' },
    { type: 'token', logo: '/usdc-logo.svg', symbol: 'USDC' },
  ]
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

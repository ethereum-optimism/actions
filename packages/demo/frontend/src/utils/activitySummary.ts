import type { ActivityEntry } from '@/providers/ActivityLogProvider'

export interface ActivitySummary {
  text: string
  tokens: Array<{
    symbol: string
    logo: string
    position: number
  }>
}

const ACTIVITY_SUMMARIES: Record<
  string,
  (entry: ActivityEntry) => string | null
> = {
  deposit: () => 'Lent USDC',
  withdraw: () => 'Withdrew USDC',
  mint: () => 'Minted USDC',
  swap: () => 'Swapped tokens',
  create: () => 'Created wallet',
  createHosted: () => 'Created hosted wallet',
}

export function getActivitySummary(entry: ActivityEntry): string {
  const handler = ACTIVITY_SUMMARIES[entry.action]
  if (handler) {
    return handler(entry) || entry.action
  }

  // Fallback: use description from action field
  const typeLabel =
    entry.type === 'lend'
      ? 'Lend'
      : entry.type === 'withdraw'
        ? 'Withdraw'
        : entry.type === 'fund'
          ? 'Fund'
          : 'Wallet'

  return `${typeLabel}: ${entry.action}`
}

export function isSignedTransaction(entry: ActivityEntry): boolean {
  return !!entry.blockExplorerUrl
}

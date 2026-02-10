import { useState, useCallback, useEffect } from 'react'

interface LendBalanceEntry {
  type: 'deposit' | 'withdraw'
  amount: number
  timestamp: string
}

interface MarketLedger {
  entries: LendBalanceEntry[]
  netDeposited: number
}

type LedgerState = Record<string, MarketLedger>

function makeMarketKey(address: string, chainId: number): string {
  return `${address.toLowerCase()}-${chainId}`
}

function getStorageKey(walletProvider?: string): string {
  return walletProvider ? `lend-balance-${walletProvider}` : 'lend-balance'
}

function loadLedger(storageKey: string): LedgerState {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored ? (JSON.parse(stored) as LedgerState) : {}
  } catch {
    return {}
  }
}

function saveLedger(storageKey: string, ledger: LedgerState): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(ledger))
  } catch {
    // Ignore storage errors
  }
}

export function useLendBalance(walletProvider?: string) {
  const storageKey = getStorageKey(walletProvider)
  const [ledger, setLedger] = useState<LedgerState>(() =>
    loadLedger(storageKey),
  )

  // Sync to localStorage when ledger changes
  useEffect(() => {
    saveLedger(storageKey, ledger)
  }, [ledger, storageKey])

  const recordTransaction = useCallback(
    (
      marketId: { address: string; chainId: number },
      type: 'deposit' | 'withdraw',
      amount: number,
    ) => {
      const key = makeMarketKey(marketId.address, marketId.chainId)

      setLedger((prev) => {
        const existing = prev[key] || { entries: [], netDeposited: 0 }
        const delta = type === 'deposit' ? amount : -amount
        const entry: LendBalanceEntry = {
          type,
          amount,
          timestamp: new Date().toISOString(),
        }

        return {
          ...prev,
          [key]: {
            entries: [...existing.entries, entry],
            netDeposited: Math.max(0, existing.netDeposited + delta),
          },
        }
      })
    },
    [],
  )

  // Seed ledger for markets that have on-chain balances but no tracking history.
  // Assumes the existing balance is the net deposited baseline.
  const seedMarkets = useCallback(
    (
      markets: Array<{
        marketId: { address: string; chainId: number }
        balance: number
      }>,
    ) => {
      setLedger((prev) => {
        let updated = false
        const next = { ...prev }
        for (const market of markets) {
          const key = makeMarketKey(
            market.marketId.address,
            market.marketId.chainId,
          )
          if (!next[key] && market.balance > 0) {
            next[key] = { entries: [], netDeposited: market.balance }
            updated = true
          }
        }
        return updated ? next : prev
      })
    },
    [],
  )

  const getInterest = useCallback(
    (
      marketId: { address: string; chainId: number },
      currentOnChainBalance: string,
    ): number => {
      const key = makeMarketKey(marketId.address, marketId.chainId)
      const market = ledger[key]
      if (!market) return 0

      const current = parseFloat(currentOnChainBalance)
      if (isNaN(current) || current <= 0) return 0

      const interest = current - market.netDeposited
      return interest > 0.000001 ? interest : 0
    },
    [ledger],
  )

  return { recordTransaction, getInterest, seedMarkets }
}

// Morpho demo magic: auto-pledges unpledged lend-vault shares as borrow collateral, once per market per mount.

import { useEffect, useRef } from 'react'

import { morphoBorrowMarketForVault } from '@/constants/markets'
import type { UseBorrowProviderReturn } from '@/hooks/useBorrowProvider'
import type { MarketPosition } from '@/types/market'

export function useReconcileMorphoCollateral(
  marketPositions: MarketPosition[],
  handleTransaction: UseBorrowProviderReturn['handleTransaction'],
): void {
  const reconciledRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    marketPositions.forEach((position) => {
      if (position.provider !== 'morpho') return
      const shares = position.depositedSharesRaw
      if (!shares || shares <= 0n) return
      const borrowMarket = morphoBorrowMarketForVault(
        position.marketId.address,
        position.marketId.chainId,
      )
      if (!borrowMarket) return
      const key = `${position.marketId.chainId}:${position.marketId.address.toLowerCase()}`
      if (reconciledRef.current.has(key)) return
      reconciledRef.current.add(key)
      void handleTransaction('depositCollateral', {
        marketId: {
          kind: borrowMarket.kind,
          marketId: borrowMarket.marketId,
          chainId: borrowMarket.chainId,
        },
        amount: { max: true },
      }).catch((error) => {
        reconciledRef.current.delete(key)
        console.warn('Collateral reconciliation failed', error)
      })
    })
  }, [marketPositions, handleTransaction])
}

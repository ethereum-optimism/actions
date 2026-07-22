// Morpho demo magic: auto-pledges unpledged lend-vault shares as borrow collateral, once per market per mount.

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

import { morphoBorrowMarketForVault } from '@/constants/markets'
import type { UseBorrowProviderReturn } from '@/hooks/useBorrowProvider'
import type { MarketPosition } from '@/types/market'

function sameVault(a: MarketPosition, b: MarketPosition): boolean {
  return (
    a.marketId.address.toLowerCase() === b.marketId.address.toLowerCase() &&
    a.marketId.chainId === b.marketId.chainId
  )
}

export function useReconcileMorphoCollateral(
  marketPositions: MarketPosition[],
  handleTransaction: UseBorrowProviderReturn['handleTransaction'],
  setMarketPositions: Dispatch<SetStateAction<MarketPosition[]>>,
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

      // Prevent refetch double-count.
      const pledgedSnapshot = position.directDepositedAmount
      setMarketPositions((prev) =>
        prev.map((p) =>
          sameVault(p, position)
            ? {
                ...p,
                directDepositedAmount: '0',
                directDepositedShares: null,
                directDepositedSharesRaw: null,
                depositedSharesRaw: null,
                pledgedCollateralAmount: pledgedSnapshot,
              }
            : p,
        ),
      )

      void handleTransaction('depositCollateral', {
        marketId: {
          kind: borrowMarket.kind,
          marketId: borrowMarket.marketId,
          chainId: borrowMarket.chainId,
        },
        amount: { max: true },
      }).catch((error) => {
        setMarketPositions((prev) =>
          prev.map((p) =>
            sameVault(p, position)
              ? { ...p, ...position, pledgedCollateralAmount: null }
              : p,
          ),
        )
        console.warn('Collateral reconciliation failed', error)
      })
    })
  }, [marketPositions, handleTransaction, setMarketPositions])
}

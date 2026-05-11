/**
 * Neutral selector hook that returns the borrow positions (if any)
 * securing a given lend asset. Used by Lend's `Action.tsx` to know
 * whether to render `<BorrowHealthCard>` in withdraw mode, without
 * Lend's code importing the borrow context directly.
 *
 * Reads via `useContext` (not the throwing
 * `useBorrowProviderContext`) so Lend's component tree can render
 * outside a `<BorrowProviderContextProvider>` (e.g. in unit tests for
 * `Action.tsx`) and gracefully default to "no positions known".
 *
 * Match key is `(symbol, chainId)`. Returns referentially stable
 * values via `useMemo` so re-renders don't cascade through
 * `<BorrowHealthCard>`. Returns `EMPTY` while the borrow provider's
 * `isInitialLoad` is true so consumers fail safe ("not yet known"
 * rather than "no borrow").
 */

import { useContext, useMemo } from 'react'
import { BorrowProviderContext } from '@/contexts/BorrowProviderContext'
import type { Asset } from '@eth-optimism/actions-sdk'
import type { BorrowMarketPosition } from '@/types/borrow'

export interface CollateralStatus {
  readonly positions: readonly BorrowMarketPosition[]
  readonly isPledged: boolean
}

const EMPTY: CollateralStatus = { positions: [], isPledged: false }

export function useCollateralStatus(asset: Asset | null): CollateralStatus {
  const ctx = useContext(BorrowProviderContext)
  const borrowPositions = ctx?.borrowPositions ?? []
  const isInitialLoad = ctx?.isInitialLoad ?? false
  return useMemo<CollateralStatus>(() => {
    if (!asset || isInitialLoad || !ctx) return EMPTY
    const positions = borrowPositions.filter(
      (p) =>
        p.collateralAsset.metadata.symbol === asset.metadata.symbol &&
        p.marketId.chainId in (asset.address ?? {}),
    )
    if (positions.length === 0) return EMPTY
    return { positions, isPledged: true }
  }, [asset, borrowPositions, isInitialLoad, ctx])
}

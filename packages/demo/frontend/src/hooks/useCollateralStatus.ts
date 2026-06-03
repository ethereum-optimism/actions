/**
 * Selector hook returning the borrow positions (if any) securing a given lend
 * asset, matched on `(symbol, chainId)`. Reads via raw `useContext` so Lend can
 * render outside a `<BorrowProviderContextProvider>`. Returns `EMPTY` during
 * `isInitialLoad` so consumers fail safe to "not yet known".
 */

import { useContext, useMemo } from 'react'
import type { Asset } from '@eth-optimism/actions-sdk'
import { BorrowProviderContext } from '@/contexts/BorrowProviderContext'
import type { BorrowPosition } from '@/types/market'

export interface CollateralStatus {
  readonly positions: readonly BorrowPosition[]
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
        asset.address?.[p.marketId.chainId] !== undefined,
    )
    if (positions.length === 0) return EMPTY
    return { positions, isPledged: true }
  }, [asset, borrowPositions, isInitialLoad, ctx])
}

/**
 * Neutral selector hook that returns the borrow positions (if any)
 * securing a given lend asset. Used by Lend's `Action.tsx` to know
 * whether to render `<BorrowHealthCard>` in withdraw mode, without
 * Lend's code importing the borrow context directly.
 *
 * Match key is `(symbol, chainId)` per deepen-plan finding. Returns
 * referentially stable values via useMemo so re-renders don't cascade
 * through `<BorrowHealthCard>`. Returns `EMPTY` while the borrow
 * provider's `isInitialLoad` is true so consumers fail safe (assume
 * "not yet known" rather than "no borrow").
 */

import { useMemo } from 'react'
import { useBorrowProviderContext } from '@/contexts/BorrowProviderContext'
import type { Asset } from '@eth-optimism/actions-sdk'
import type { BorrowMarketPosition } from '@/types/borrow'

export interface CollateralStatus {
  readonly positions: readonly BorrowMarketPosition[]
  readonly isPledged: boolean
}

const EMPTY: CollateralStatus = { positions: [], isPledged: false }

export function useCollateralStatus(asset: Asset | null): CollateralStatus {
  const { borrowPositions, isInitialLoad } = useBorrowProviderContext()
  return useMemo<CollateralStatus>(() => {
    if (!asset || isInitialLoad) return EMPTY
    const positions = borrowPositions.filter(
      (p) =>
        p.collateralAsset.metadata.symbol === asset.metadata.symbol &&
        p.marketId.chainId in (asset.address ?? {}),
    )
    if (positions.length === 0) return EMPTY
    return { positions, isPledged: true }
  }, [asset, borrowPositions, isInitialLoad])
}

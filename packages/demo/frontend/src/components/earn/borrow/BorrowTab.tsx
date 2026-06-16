// Borrow tab: wires the lend-position selector (collateral) to the borrow form.

import { useEffect, useMemo, useState } from 'react'
import { useBorrowProviderContext } from '@/contexts/BorrowProviderContext'
import { useLendProviderContext } from '@/contexts/LendProviderContext'
import { DEBT_DUST_THRESHOLD } from '@/constants/borrow'
import { useReconcileMorphoCollateral } from '@/demoMagic'
import type { MarketPosition } from '@/types/market'
import { buildEffectiveLendPositions } from '@/utils/effectiveLendPositions'
import { BorrowAction } from './BorrowAction'
import { BorrowPositions } from './BorrowPositions'
import { LendPositionSelector } from './LendPositionSelector'
import { NoCollateralBanner } from './NoCollateralBanner'

export function BorrowTab() {
  const {
    markets: lendMarkets,
    marketPositions,
    isInitialLoad,
  } = useLendProviderContext()
  const { markets, handleMarketSelect, borrowPositions, handleTransaction } =
    useBorrowProviderContext()

  useReconcileMorphoCollateral(marketPositions, handleTransaction)

  const effectiveLendPositions = useMemo(
    () =>
      buildEffectiveLendPositions(
        lendMarkets,
        marketPositions,
        borrowPositions,
      ),
    [borrowPositions, lendMarkets, marketPositions],
  )

  const positionsWithDeposits = useMemo(
    () =>
      effectiveLendPositions.filter(
        (p) => p.depositedAmount && parseFloat(p.depositedAmount) > 0,
      ),
    [effectiveLendPositions],
  )

  const [selectedLendPosition, setSelectedLendPosition] =
    useState<MarketPosition | null>(null)

  // Default-select the first eligible lend position once they load.
  useEffect(() => {
    if (!selectedLendPosition && positionsWithDeposits.length > 0) {
      setSelectedLendPosition(positionsWithDeposits[0])
    }
  }, [positionsWithDeposits, selectedLendPosition])

  // Refresh the selected snapshot when upstream data changes so borrow calls pledge the current share count.
  useEffect(() => {
    if (!selectedLendPosition) return
    const fresh = positionsWithDeposits.find(
      (p) =>
        p.marketId.address.toLowerCase() ===
          selectedLendPosition.marketId.address.toLowerCase() &&
        p.marketId.chainId === selectedLendPosition.marketId.chainId,
    )
    if (fresh && fresh !== selectedLendPosition) {
      setSelectedLendPosition(fresh)
    }
  }, [positionsWithDeposits, selectedLendPosition])

  // Sync the borrow context's selected market to the one accepting the chosen lend asset as collateral.
  useEffect(() => {
    if (!selectedLendPosition) return
    const matchingMarket = markets.find(
      (m) =>
        m.collateralAsset.metadata.symbol ===
        selectedLendPosition.asset.metadata.symbol,
    )
    if (matchingMarket) handleMarketSelect(matchingMarket)
  }, [selectedLendPosition, markets, handleMarketSelect])

  const hasCollateral = !isInitialLoad && positionsWithDeposits.length > 0

  // Exclude collateral-only or fully-repaid positions (below dust threshold).
  const activeBorrowPositions = useMemo(
    () =>
      borrowPositions.filter(
        (p) => parseFloat(p.borrowAmountFormatted) >= DEBT_DUST_THRESHOLD,
      ),
    [borrowPositions],
  )

  return (
    <>
      <div>
        <h3
          className="mb-3"
          style={{ color: '#1a1b1e', fontSize: '16px', fontWeight: 600 }}
        >
          Select Lend Position
        </h3>
        {hasCollateral ? (
          <LendPositionSelector
            positions={positionsWithDeposits}
            selected={selectedLendPosition}
            onSelect={setSelectedLendPosition}
          />
        ) : (
          <NoCollateralBanner />
        )}
      </div>

      {hasCollateral && selectedLendPosition && (
        <BorrowAction selectedLendPosition={selectedLendPosition} />
      )}

      {activeBorrowPositions.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <BorrowPositions positions={activeBorrowPositions} />
        </div>
      )}
    </>
  )
}

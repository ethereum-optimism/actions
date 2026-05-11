/**
 * Top-level Borrow tab layout.
 *
 * Wires the lend-position selector (chooses the collateral source) to
 * the borrow provider context (selects the matching borrow market) and
 * mounts the borrow form when collateral is selected. Lend positions
 * with zero deposit are filtered out; if the user has no eligible
 * positions, the no-collateral banner is shown.
 *
 * The selector is inlined here (one consumer); promote to its own file
 * only when a second consumer appears.
 */

import { useEffect, useMemo, useState } from 'react'
import { useBorrowProviderContext } from '@/contexts/BorrowProviderContext'
import { useLendProviderContext } from '@/contexts/LendProviderContext'
import type { MarketPosition } from '@/types/market'
import { Dropdown } from '../Dropdown'
import { BorrowAction } from './BorrowAction'
import { BorrowPositions } from './BorrowPositions'

export function BorrowTab() {
  const { marketPositions, isInitialLoad } = useLendProviderContext()
  const { markets, handleMarketSelect, borrowPositions } =
    useBorrowProviderContext()

  const positionsWithDeposits = useMemo(
    () =>
      marketPositions.filter(
        (p) =>
          p.depositedAmount &&
          parseFloat(p.depositedAmount) > 0 &&
          p.depositedAmount !== '0' &&
          p.depositedAmount !== '0.00',
      ),
    [marketPositions],
  )

  const [selectedLendPosition, setSelectedLendPosition] =
    useState<MarketPosition | null>(null)

  // Default-select the first eligible lend position once they load.
  useEffect(() => {
    if (!selectedLendPosition && positionsWithDeposits.length > 0) {
      setSelectedLendPosition(positionsWithDeposits[0])
    }
  }, [positionsWithDeposits, selectedLendPosition])

  // Sync the borrow context's selected market to whatever borrow market
  // accepts the chosen lend asset as collateral.
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

      {borrowPositions.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <BorrowPositions positions={borrowPositions} />
        </div>
      )}
    </>
  )
}

function LendPositionSelector({
  positions,
  selected,
  onSelect,
}: {
  positions: MarketPosition[]
  selected: MarketPosition | null
  onSelect: (position: MarketPosition) => void
}) {
  return (
    <Dropdown<MarketPosition>
      options={positions}
      selected={selected}
      onSelect={onSelect}
      keyOf={(p) => `${p.marketId.address}-${p.marketId.chainId}`}
      isSelected={(a, b) =>
        !!b &&
        a.marketId.address === b.marketId.address &&
        a.marketId.chainId === b.marketId.chainId
      }
      placeholder="Select a lend position"
      renderOption={(position) => <LendPositionRow position={position} />}
    />
  )
}

function LendPositionRow({ position }: { position: MarketPosition }) {
  const formattedUsd = formatUsd(position.depositedAmount)
  return (
    <div className="flex items-center gap-2 w-full" style={{ minWidth: 0 }}>
      <img
        src={position.marketLogo}
        alt={position.marketName}
        style={{ width: '20px', height: '20px', flexShrink: 0 }}
      />
      <span
        style={{
          color: '#1a1b1e',
          fontSize: '14px',
          fontWeight: 500,
          fontFamily: 'Inter',
        }}
      >
        {position.marketName}
      </span>
      <span style={{ color: '#9195A6', fontSize: '14px' }}>on</span>
      <img
        src={position.networkLogo}
        alt={position.networkName}
        style={{ width: '16px', height: '16px', flexShrink: 0 }}
      />
      <span
        style={{
          color: '#1a1b1e',
          fontSize: '14px',
          fontFamily: 'Inter',
        }}
      >
        {position.networkName}
      </span>
      <span
        style={{
          marginLeft: 'auto',
          color: '#1a1b1e',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: 'Inter',
        }}
      >
        {formattedUsd}
      </span>
    </div>
  )
}

function formatUsd(deposited: string | null): string {
  if (!deposited) return '$0.00'
  const num = parseFloat(deposited)
  if (!Number.isFinite(num)) return '$0.00'
  return `$${num.toFixed(2)}`
}

function NoCollateralBanner() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        backgroundColor: '#F5F5F7',
        border: '1px solid #E0E2EB',
        borderRadius: '12px',
        color: '#1a1b1e',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <InfoIcon />
      <span>To borrow you need to lend any asset to be used as collateral</span>
    </div>
  )
}

function InfoIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="10" cy="10" r="8" stroke="#9195A6" strokeWidth="1.5" />
      <path
        d="M10 6V10M10 13V13.5"
        stroke="#9195A6"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

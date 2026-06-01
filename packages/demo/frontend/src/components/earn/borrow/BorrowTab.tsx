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
import { useTabSwitcher } from '@/contexts/TabSwitcherContext'
import { buildEffectiveLendPositions } from '@/utils/effectiveLendPositions'
import { displaySymbol, formatUsd } from '@/utils/tokenDisplay'
import InfoIcon from '@/components/icons/InfoIcon'
import { Dropdown } from '../Dropdown'
import { BorrowAction } from './BorrowAction'
import { BorrowPositions } from './BorrowPositions'

export function BorrowTab() {
  const {
    markets: lendMarkets,
    marketPositions,
    isInitialLoad,
  } = useLendProviderContext()
  const { markets, handleMarketSelect, borrowPositions } =
    useBorrowProviderContext()

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

  // Refresh the snapshot to the latest entry in positionsWithDeposits when
  // upstream data (depositedSharesRaw, pledged amounts, etc.) changes, so
  // downstream /borrow/price calls pledge the current share count, not the
  // snapshot captured at default-selection time.
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
  const { setActiveTab } = useTabSwitcher()
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
      singleOptionMessage={
        <>
          Open another{' '}
          <button
            type="button"
            onClick={() => setActiveTab('lend')}
            style={{
              color: '#3374DB',
              fontWeight: 500,
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
              fontFamily: 'inherit',
              fontSize: 'inherit',
            }}
          >
            Lend
          </button>{' '}
          position
        </>
      }
      renderOption={(position) => <LendPositionRow position={position} />}
    />
  )
}

function LendPositionRow({ position }: { position: MarketPosition }) {
  const formattedUsd =
    formatUsd(parseFloat(position.depositedAmount || '0')) ?? '$0.00'
  const symbol = displaySymbol(position.asset.metadata.symbol)
  return (
    <div className="flex items-center gap-2 w-full" style={{ minWidth: 0 }}>
      {/* Asset logo with market logo as a small overlay badge — same
          presentation as `MarketOption` so the borrow tab's lend-position
          selector matches the lend tab's market selector visually. */}
      <div className="relative flex items-center" style={{ flexShrink: 0 }}>
        <img
          src={position.assetLogo}
          alt={symbol}
          style={{ width: '24px', height: '24px' }}
        />
        <div
          className="absolute -right-1 -bottom-1 bg-white rounded-full flex items-center justify-center"
          style={{ width: '18px', height: '18px', padding: '2px' }}
        >
          <img
            src={position.marketLogo}
            alt={position.marketName}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              width: 'auto',
              height: 'auto',
            }}
          />
        </div>
      </div>
      <span
        style={{
          color: '#1a1b1e',
          fontSize: '14px',
          fontWeight: 500,
          fontFamily: 'Inter',
        }}
      >
        {position.marketName} {symbol}
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
      <InfoIcon
        width={20}
        height={20}
        strokeWidth={1.5}
        style={{ flexShrink: 0 }}
      />
      <span>To borrow you need to lend any asset to be used as collateral</span>
    </div>
  )
}

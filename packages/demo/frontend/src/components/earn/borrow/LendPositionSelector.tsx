/**
 * Lend-position selector for the Borrow tab: a dropdown of the user's
 * eligible lend positions (the collateral source). Each row mirrors
 * `MarketOption`'s asset+market+network presentation so the borrow tab's
 * selector matches the lend tab's market selector visually.
 */

import type { MarketPosition } from '@/types/market'
import { useTabSwitcher } from '@/contexts/TabSwitcherContext'
import { displaySymbol, formatUsd } from '@/utils/tokenDisplay'
import { Dropdown } from '../Dropdown'

export function LendPositionSelector({
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

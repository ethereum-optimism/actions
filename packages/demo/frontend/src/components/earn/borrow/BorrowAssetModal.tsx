/**
 * Asset-select modal for the Borrow tab.
 *
 * Single-select. List of borrowable assets with their per-asset Borrow
 * APY and Liquidity columns. Click closes the modal and bubbles the
 * selected asset up via `onSelect`.
 */

import { createPortal } from 'react-dom'
import type { BorrowMarket } from '@eth-optimism/actions-sdk'
import { Modal, ModalHeader } from '../../Modal'

export interface BorrowAssetModalProps {
  isOpen: boolean
  onClose: () => void
  markets: readonly BorrowMarket[]
  onSelect: (market: BorrowMarket) => void
}

export function BorrowAssetModal({
  isOpen,
  onClose,
  markets,
  onSelect,
}: BorrowAssetModalProps) {
  if (!isOpen) return null
  return createPortal(
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="480px">
      <ModalHeader title="Select a token to Borrow" onClose={onClose} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          gap: '8px 24px',
          padding: '8px 0 12px',
          color: '#9195A6',
          fontSize: '12px',
          fontFamily: 'Inter',
          fontWeight: 500,
          borderBottom: '1px solid #E0E2EB',
        }}
      >
        <span>Asset</span>
        <span style={{ textAlign: 'right' }}>Borrow APY</span>
        <span style={{ textAlign: 'right' }}>Liquidity</span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '420px',
          overflowY: 'auto',
        }}
      >
        {markets.map((market) => (
          <button
            key={`${market.marketId.kind}-${
              market.marketId.kind === 'morpho-blue'
                ? market.marketId.marketId
                : ''
            }`}
            onClick={() => onSelect(market)}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              alignItems: 'center',
              gap: '8px 24px',
              padding: '14px 4px',
              border: 'none',
              borderBottom: '1px solid #F1F1F4',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontFamily: 'Inter',
              transition: 'background-color 120ms ease-in-out',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#F5F5F7'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
          >
            <AssetCell market={market} />
            <span style={{ textAlign: 'right', fontSize: '14px' }}>
              {(market.borrowApy * 100).toFixed(1)}%
            </span>
            <LiquidityCell market={market} />
          </button>
        ))}
      </div>
    </Modal>,
    document.body,
  )
}

function AssetCell({ market }: { market: BorrowMarket }) {
  const symbol = market.borrowAsset.metadata.symbol.replace('_DEMO', '')
  const name = market.borrowAsset.metadata.name
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}
    >
      <span
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          backgroundColor: '#F5F5F7',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 600,
          color: '#9195A6',
        }}
      >
        {symbol[0] ?? '?'}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span
          style={{
            color: '#1a1b1e',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          {name}
        </span>
        <span
          style={{
            color: '#9195A6',
            fontSize: '12px',
          }}
        >
          {symbol}
        </span>
      </span>
    </span>
  )
}

function LiquidityCell({ market }: { market: BorrowMarket }) {
  // Available liquidity = totalCollateral - totalBorrowed in the borrow
  // asset's wei units. For the stub we approximate with the difference;
  // PR #4's backend returns this pre-derived if added.
  const available = market.totalCollateral - market.totalBorrowed
  const decimals = market.borrowAsset.metadata.decimals
  const human = Number(available) / 10 ** decimals
  const symbol = market.borrowAsset.metadata.symbol.replace('_DEMO', '')
  return (
    <span
      style={{
        textAlign: 'right',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <span style={{ color: '#1a1b1e', fontSize: '14px' }}>
        {formatHuman(human)} {symbol}
      </span>
    </span>
  )
}

function formatHuman(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(2)
}

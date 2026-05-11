/**
 * Top-level Borrow tab layout.
 *
 * Phase 2: renders just the no-collateral empty state when the user has
 * no lend positions, or the lend-position selector header plus a
 * placeholder borrow card when they do. The full `<BorrowAction>`,
 * `<BorrowHealthCard>`, asset modal, and review modal land in Phase 3.
 *
 * Once a borrow position exists, `<BorrowPositions>` renders beneath the
 * card. That comes in Phase 4.
 */

import { useLendProviderContext } from '@/contexts/LendProviderContext'

export function BorrowTab() {
  const { marketPositions, isInitialLoad } = useLendProviderContext()

  const positionsWithDeposits = marketPositions.filter(
    (p) =>
      p.depositedAmount &&
      parseFloat(p.depositedAmount) > 0 &&
      p.depositedAmount !== '0' &&
      p.depositedAmount !== '0.00',
  )

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
        {hasCollateral ? <SelectedLendPositionStub /> : <NoCollateralBanner />}
      </div>

      {hasCollateral && <BorrowFormPlaceholder />}
    </>
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
      <InfoIcon />
      <span>To borrow you need to lend any asset to be used as collateral</span>
    </div>
  )
}

function SelectedLendPositionStub() {
  return (
    <div
      style={{
        padding: '14px 16px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '12px',
        color: '#9195A6',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      Lend position selector coming in Phase 3
    </div>
  )
}

function BorrowFormPlaceholder() {
  return (
    <div
      style={{
        marginTop: '24px',
        padding: '24px',
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '24px',
        color: '#9195A6',
        fontSize: '14px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        textAlign: 'center',
      }}
    >
      Borrow form coming in Phase 3
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

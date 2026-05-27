/**
 * Shared building blocks for "Review" modals (ReviewSwapModal,
 * ReviewBorrowHealthModal, etc.). Promoted from ReviewSwapModal's
 * private helpers so the new Borrow review modal can compose the
 * same rows without duplicating layout and styling.
 */

export function AmountRow({
  label,
  amount,
  logo,
  symbol,
  usd,
}: {
  label: string
  amount: { main: string; secondary?: string }
  logo: string
  symbol: string
  usd?: string | null
}) {
  return (
    <div>
      <span style={{ fontSize: '14px', color: '#9195A6' }}>{label}</span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: '32px', fontWeight: 500, color: '#1a1b1e' }}>
          {amount.main}
          {amount.secondary && (
            <span style={{ color: '#9195A6', fontSize: '20px' }}>
              {amount.secondary}
            </span>
          )}
        </span>
        <img
          src={logo}
          alt={symbol}
          style={{ width: '32px', height: '32px', borderRadius: '50%' }}
        />
      </div>
      {usd && <span style={{ fontSize: '14px', color: '#9195A6' }}>{usd}</span>}
    </div>
  )
}

export function DownArrow() {
  return (
    <div style={{ padding: '8px 0' }}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M8 3V13M8 13L4 9M8 13L12 9"
          stroke="#9195A6"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string
  value: React.ReactNode
  valueColor?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span
        style={{
          color: '#666666',
          fontSize: '14px',
          fontFamily: 'Inter',
        }}
      >
        {label}
      </span>
      <span style={{ color: valueColor || '#1a1b1e' }}>{value}</span>
    </div>
  )
}

export function FormattedAmount({
  amount,
  suffix,
}: {
  amount: { main: string; secondary?: string }
  suffix: string
}) {
  return (
    <>
      {amount.main}
      {amount.secondary && (
        <span style={{ color: '#9195A6', fontSize: '12px' }}>
          {amount.secondary}
        </span>
      )}{' '}
      {suffix}
    </>
  )
}

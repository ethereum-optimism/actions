// Repay-gating notice: links to swap when the held balance can't cover the debt.

import InfoIcon from '@/components/icons/InfoIcon'

export function ReacquireDebtNotice({
  symbol,
  variant,
  maxRepayable,
  onAcquire,
}: {
  symbol: string
  /** `none`: balance can't repay anything. `partial`: some, but not the full debt. */
  variant: 'none' | 'partial'
  maxRepayable: number
  onAcquire: () => void
}) {
  const message =
    variant === 'none'
      ? `You need ${symbol} to repay this loan.`
      : `You can repay up to ${maxRepayable} ${symbol}. Get more to repay in full.`

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
      <span style={{ flex: 1 }}>{message}</span>
      <button
        onClick={onAcquire}
        style={{
          flexShrink: 0,
          padding: '8px 14px',
          border: '1px solid #1a1b1e',
          borderRadius: '999px',
          backgroundColor: 'transparent',
          color: '#1a1b1e',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        Get {symbol}
      </button>
    </div>
  )
}

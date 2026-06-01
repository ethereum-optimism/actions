import InfoIcon from '@/components/icons/InfoIcon'
import { displaySymbol, formatUsd } from '@/utils/tokenDisplay'
import { AmountInput } from '../AmountInput'
import { MaxButton } from '../CtaButton'

export function SectionHeader() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '16px',
        fontWeight: 600,
        color: '#1a1b1e',
      }}
    >
      Select Asset
      <InfoIcon />
    </div>
  )
}

export function AmountSection({
  mode,
  amount,
  onAmountChange,
  onMaxClick,
  amountUsd,
  activeAsset,
  onTokenClick,
}: {
  mode: 'borrow' | 'repay'
  amount: string
  onAmountChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onMaxClick: () => void
  amountUsd: number
  activeAsset: { metadata: { symbol: string } } | null
  onTokenClick?: () => void
}) {
  const symbol = activeAsset
    ? displaySymbol(activeAsset.metadata.symbol)
    : 'Select token'
  const inputProps = {
    value: amount,
    onChange: onAmountChange,
    disabled: false,
    displaySymbol: symbol,
    ...(onTokenClick ? { onTokenClick } : {}),
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <span style={{ color: '#1a1b1e', fontSize: '14px' }}>
        {mode === 'borrow' ? 'Borrow' : 'Repay'}
      </span>
      <AmountInput {...inputProps} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '13px',
          color: '#9195A6',
        }}
      >
        <span>{formatUsd(amountUsd) ?? '$0.00'}</span>
        <span
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
        >
          <MaxButton onClick={onMaxClick} />
        </span>
      </div>
    </div>
  )
}

import CaretDownIcon from '@/components/icons/CaretDownIcon'

interface BaseProps {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled: boolean
  displaySymbol: string
  tokenLogo?: string
}

interface StaticChipProps extends BaseProps {
  onTokenClick?: undefined
}

interface SelectorChipProps extends BaseProps {
  /** When set, the token chip becomes a clickable selector with a dropdown caret. */
  onTokenClick: () => void
}

export type AmountInputProps = StaticChipProps | SelectorChipProps

// Layout shared by the static and clickable token chips; the divider lives
// on the left edge so the chip reads as a segment of the input row.
const tokenChipStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  paddingLeft: '12px',
  borderLeft: '1px solid #E0E2EB',
} as const

function TokenChip({
  displaySymbol,
  tokenLogo,
  onTokenClick,
}: Pick<BaseProps, 'displaySymbol' | 'tokenLogo'> & {
  onTokenClick?: () => void
}) {
  const tokenContent = (
    <>
      {tokenLogo && (
        <img
          src={tokenLogo}
          alt={displaySymbol}
          style={{ width: '20px', height: '20px', borderRadius: '50%' }}
        />
      )}
      <span
        style={{
          color: '#9195A6',
          fontSize: '14px',
          fontWeight: 600,
          fontFamily: 'Inter',
        }}
      >
        {displaySymbol}
      </span>
      {onTokenClick && <CaretDownIcon />}
    </>
  )

  if (!onTokenClick) return <div style={tokenChipStyle}>{tokenContent}</div>
  return (
    <button
      type="button"
      onClick={onTokenClick}
      style={{
        ...tokenChipStyle,
        border: 'none',
        borderLeft: '1px solid #E0E2EB',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      {tokenContent}
    </button>
  )
}

export function AmountInput({
  value,
  onChange,
  disabled,
  displaySymbol,
  tokenLogo,
  onTokenClick,
}: AmountInputProps) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        border: '1px solid #E0E2EB',
        borderRadius: '12px',
        padding: '12px 16px',
        backgroundColor: '#FFFFFF',
      }}
    >
      <input
        type="text"
        placeholder="0"
        value={value}
        onChange={onChange}
        disabled={disabled}
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          fontSize: '16px',
          color: disabled ? '#9195A6' : '#000',
          backgroundColor: 'transparent',
          fontFamily: 'Inter',
          cursor: disabled ? 'not-allowed' : 'text',
        }}
      />
      <TokenChip
        displaySymbol={displaySymbol}
        tokenLogo={tokenLogo}
        onTokenClick={onTokenClick}
      />
    </div>
  )
}

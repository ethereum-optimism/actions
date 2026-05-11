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

function CaretDownIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 4.5L6 7.5L9 4.5"
        stroke="#1a1b1e"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
  const chipContent = (
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
      {onTokenClick ? (
        <button
          type="button"
          onClick={onTokenClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            paddingLeft: '12px',
            marginLeft: '0',
            borderLeft: '1px solid #E0E2EB',
            border: 'none',
            borderRadius: '0',
            borderLeftStyle: 'solid',
            borderLeftWidth: '1px',
            borderLeftColor: '#E0E2EB',
            background: 'transparent',
            cursor: 'pointer',
            padding: '0 0 0 12px',
          }}
        >
          {chipContent}
        </button>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            paddingLeft: '12px',
            borderLeft: '1px solid #E0E2EB',
          }}
        >
          {chipContent}
        </div>
      )}
    </div>
  )
}

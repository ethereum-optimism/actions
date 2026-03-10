export function AmountInput({
  value,
  onChange,
  disabled,
  displaySymbol,
}: {
  value: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  disabled: boolean
  displaySymbol: string
}) {
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          paddingLeft: '12px',
          borderLeft: '1px solid #E0E2EB',
        }}
      >
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
      </div>
    </div>
  )
}

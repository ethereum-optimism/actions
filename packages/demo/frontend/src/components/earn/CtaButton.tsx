interface CtaButtonProps {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}

export function CtaButton({ onClick, disabled, children }: CtaButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3 px-4 font-medium transition-all"
      style={{
        backgroundColor: disabled ? '#D1D5DB' : '#FF0420',
        color: disabled ? '#6B7280' : '#FFFFFF',
        fontSize: '16px',
        borderRadius: '12px',
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: 1,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {children}
    </button>
  )
}

export function CloseButton({
  onClick,
  size = 20,
}: {
  onClick: () => void
  size?: number
}) {
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        padding: '4px',
        color: '#666666',
        fontSize: `${size}px`,
        lineHeight: 1,
      }}
    >
      &times;
    </button>
  )
}

export function MaxButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '0 4px',
        border: 'none',
        fontSize: '14px',
        fontWeight: 600,
        color: '#3374DB',
        cursor: 'pointer',
        backgroundColor: 'transparent',
      }}
    >
      Max
    </button>
  )
}

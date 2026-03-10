export function ModeToggle({
  mode,
  onModeChange,
}: {
  mode: 'lend' | 'withdraw'
  onModeChange: (mode: 'lend' | 'withdraw') => void
}) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        width: '100%',
        backgroundColor: '#F5F5F7',
        borderRadius: '10px',
        padding: '3px',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '3px',
          bottom: '3px',
          left: mode === 'lend' ? '3px' : '50%',
          width: 'calc(50% - 3px)',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          transition: 'left 200ms ease-in-out',
        }}
      />
      {(['lend', 'withdraw'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onModeChange(m)}
          style={{
            flex: 1,
            position: 'relative',
            padding: '10px 32px',
            border: 'none',
            borderRadius: '8px',
            fontSize: '15px',
            fontWeight: 500,
            fontFamily: 'Inter',
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: mode === m ? '#000' : '#666',
            transition: 'color 200ms ease-in-out',
          }}
        >
          {m === 'lend' ? 'Lend' : 'Withdraw'}
        </button>
      ))}
    </div>
  )
}

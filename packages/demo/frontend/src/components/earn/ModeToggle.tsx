export interface ModeToggleOption<T extends string> {
  value: T
  label: string
}

export interface ModeToggleProps<T extends string> {
  mode: T
  onModeChange: (mode: T) => void
  options: readonly [ModeToggleOption<T>, ModeToggleOption<T>]
}

export function ModeToggle<T extends string>({
  mode,
  onModeChange,
  options,
}: ModeToggleProps<T>) {
  const activeIndex = mode === options[0].value ? 0 : 1
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
          left: activeIndex === 0 ? '3px' : '50%',
          width: 'calc(50% - 3px)',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          transition: 'left 200ms ease-in-out',
        }}
      />
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onModeChange(option.value)}
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
            color: mode === option.value ? '#000' : '#666',
            transition: 'color 200ms ease-in-out',
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

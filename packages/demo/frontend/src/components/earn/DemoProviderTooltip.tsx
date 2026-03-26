import { useState } from 'react'

export function DemoProviderTooltip() {
  const [visible, setVisible] = useState(false)
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        style={{ cursor: 'pointer', flexShrink: 0 }}
      >
        <circle cx="8" cy="8" r="7" stroke="#9195A6" strokeWidth="1.5" />
        <text
          x="8"
          y="11.5"
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          fill="#9195A6"
          fontFamily="Inter, system-ui, sans-serif"
        >
          i
        </text>
      </svg>
      {visible && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '260px',
            padding: '12px',
            backgroundColor: '#1a1b1e',
            color: '#fff',
            borderRadius: '8px',
            fontSize: '12px',
            lineHeight: '1.5',
            zIndex: 100,
            pointerEvents: 'none',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          }}
        >
          <div style={{ color: '#b0b3be', marginBottom: '6px' }}>
            Provider selection for demo purposes only.
          </div>
          <div style={{ color: '#b0b3be' }}>
            <code style={{ color: '#fff', fontSize: '11px' }}>
              wallet.swap
            </code>{' '}
            will default to the best price across all providers unless otherwise
            specified.
          </div>
          <div
            style={{
              position: 'absolute',
              top: '-4px',
              left: '50%',
              transform: 'translateX(-50%) rotate(45deg)',
              width: '8px',
              height: '8px',
              backgroundColor: '#1a1b1e',
            }}
          />
        </div>
      )}
    </div>
  )
}

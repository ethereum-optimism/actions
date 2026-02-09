import { useEffect } from 'react'

interface ToastProps {
  isVisible: boolean
  onClose: () => void
  title: string
  description: string
  duration?: number
}

export function Toast({
  isVisible,
  onClose,
  title,
  description,
  duration = 4000,
}: ToastProps) {
  useEffect(() => {
    if (!isVisible) return
    const timer = setTimeout(onClose, duration)
    return () => clearTimeout(timer)
  }, [isVisible, onClose, duration])

  if (!isVisible) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 100,
        animation: 'toast-in 0.3s ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '16px 20px',
          backgroundColor: '#FFFFFF',
          border: '1px solid #E0E2EB',
          borderRadius: '12px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
          minWidth: '280px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          style={{ flexShrink: 0, marginTop: '1px' }}
        >
          <circle cx="12" cy="12" r="12" fill="#22C55E" />
          <path
            d="M7 12.5L10 15.5L17 8.5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#1a1b1e',
              marginBottom: '2px',
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: '14px', color: '#666666' }}>
            {description}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            padding: '0',
            color: '#9195A6',
            fontSize: '16px',
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          &times;
        </button>
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

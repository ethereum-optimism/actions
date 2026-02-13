import type { ReactNode } from 'react'

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  allowBackdropClose?: boolean
  maxWidth?: string
}

export function Modal({
  isOpen,
  onClose,
  children,
  allowBackdropClose = true,
  maxWidth = '400px',
}: ModalProps) {
  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && allowBackdropClose) {
          onClose()
        }
      }}
    >
      <div
        style={{
          position: 'relative',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow:
            '0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
          width: '90%',
          maxWidth,
          padding: '24px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        {children}
      </div>
    </div>
  )
}

export interface ModalContentProps {
  icon?: ReactNode
  title: string
  description?: string
  children?: ReactNode
}

export function ModalContent({
  icon,
  title,
  description,
  children,
}: ModalContentProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '12px',
      }}
    >
      {icon && <div>{icon}</div>}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '0 36px',
        }}
      >
        <h2
          style={{
            color: '#1a1b1e',
            fontSize: '20px',
            fontWeight: 600,
          }}
        >
          {title}
        </h2>

        {description && (
          <p
            style={{
              color: '#666666',
              fontSize: '14px',
              lineHeight: '20px',
              textAlign: 'center',
            }}
          >
            {description}
          </p>
        )}
      </div>

      {children}
    </div>
  )
}

export interface ModalActionsProps {
  children: ReactNode
}

export function ModalActions({ children }: ModalActionsProps) {
  return <div className="flex gap-3 w-full">{children}</div>
}

interface ModalButtonProps {
  onClick: () => void
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
}

export function ModalButton({
  onClick,
  children,
  variant = 'primary',
  disabled = false,
}: ModalButtonProps) {
  const styles = {
    primary: {
      backgroundColor: '#0000008F',
      color: '#FFFFFF',
      border: 'none',
    },
    secondary: {
      backgroundColor: 'transparent',
      color: '#1a1b1e',
      border: '1px solid #E5E5E5',
    },
    danger: {
      backgroundColor: '#EF4444',
      color: '#FFFFFF',
      border: 'none',
    },
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 py-3 px-6 font-medium transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
      style={{
        ...styles[variant],
        fontSize: '16px',
        borderRadius: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

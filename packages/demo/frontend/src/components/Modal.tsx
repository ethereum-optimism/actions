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
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && allowBackdropClose) {
          onClose()
        }
      }}
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl"
        style={{
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
    <div className="flex flex-col items-center text-center gap-3">
      {icon && <div>{icon}</div>}

      <div className="flex flex-col items-center gap-1 px-9">
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

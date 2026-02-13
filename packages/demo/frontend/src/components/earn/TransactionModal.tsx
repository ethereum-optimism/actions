import { createPortal } from 'react-dom'
import { Modal, ModalContent, ModalButton } from '../Modal'

interface TransactionModalProps {
  isOpen: boolean
  status: 'loading' | 'error'
  onClose: () => void
  mode?: 'lend' | 'withdraw' | 'swap'
  assetSymbol?: string
}

const spinnerKeyframes = `@keyframes txm-spin { to { transform: rotate(360deg); } }`

function TransactionModal({
  isOpen,
  status,
  onClose,
  mode,
  assetSymbol,
}: TransactionModalProps) {
  if (!isOpen) return null

  const icon =
    status === 'loading' ? (
      <div
        style={{
          position: 'relative',
          width: '64px',
          height: '64px',
        }}
      >
        <style>{spinnerKeyframes}</style>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '4px solid #E5E7EB',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '4px solid #3B82F6',
            borderTopColor: 'transparent',
            animation: 'txm-spin 1s linear infinite',
          }}
        />
      </div>
    ) : (
      <div
        style={{
          width: '64px',
          height: '64px',
          borderRadius: '50%',
          backgroundColor: '#FEE2E2',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#EF4444"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </div>
    )

  const title =
    status === 'loading' ? 'Transaction Pending' : 'Transaction Failed'

  const description =
    status === 'loading'
      ? 'Please wait while your transaction is being processed...'
      : mode === 'withdraw' && assetSymbol === 'ETH'
        ? 'This is a common testnet liquidity issue, try again later.'
        : ''

  return createPortal(
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      allowBackdropClose={status === 'error'}
    >
      {status === 'error' && (
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            padding: '8px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderRadius: '8px',
            color: '#666666',
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      <ModalContent icon={icon} title={title} description={description}>
        {status === 'error' && (
          <div style={{ width: '100%', marginTop: '12px' }}>
            <ModalButton onClick={onClose}>Close</ModalButton>
          </div>
        )}
      </ModalContent>
    </Modal>,
    document.body,
  )
}

export default TransactionModal

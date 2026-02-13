import { createPortal } from 'react-dom'
import { Modal, ModalContent, ModalButton } from '../Modal'

interface TransactionModalProps {
  isOpen: boolean
  status: 'loading' | 'success' | 'error'
  onClose: () => void
  blockExplorerUrl?: string
  mode?: 'lend' | 'withdraw' | 'swap'
  assetSymbol?: string
}

function TransactionModal({
  isOpen,
  status,
  onClose,
  blockExplorerUrl,
  mode,
  assetSymbol,
}: TransactionModalProps) {
  if (!isOpen) return null

  const showClose = status !== 'loading'

  const icon = (() => {
    switch (status) {
      case 'loading':
        return (
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
            <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
          </div>
        )
      case 'success':
        return (
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#22C55E"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        )
      case 'error':
        return (
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
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
    }
  })()

  const title =
    status === 'loading'
      ? 'Transaction Pending'
      : status === 'success'
        ? 'Transaction Successful'
        : 'Transaction Failed'

  const description =
    status === 'loading'
      ? 'Please wait while your transaction is being processed...'
      : status === 'success'
        ? mode === 'withdraw'
          ? 'Your funds are now in your wallet'
          : mode === 'swap'
            ? 'Your swap has been completed'
            : 'Your funds are now earning interest'
        : mode === 'withdraw' && assetSymbol === 'ETH'
          ? 'This is a common testnet liquidity issue, try again later.'
          : ''

  return createPortal(
    <Modal isOpen={isOpen} onClose={onClose} allowBackdropClose={showClose}>
      {showClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          style={{ color: '#666666' }}
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
        {status === 'success' && blockExplorerUrl && (
          <a
            href={blockExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:opacity-80 transition-opacity"
            style={{
              color: '#3374DB',
              fontSize: '14px',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            View on Block Explorer
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 17L17 7"></path>
              <path d="M7 7h10v10"></path>
            </svg>
          </a>
        )}

        {showClose && (
          <div className="w-full mt-3">
            <ModalButton onClick={onClose}>Close</ModalButton>
          </div>
        )}
      </ModalContent>
    </Modal>,
    document.body,
  )
}

export default TransactionModal

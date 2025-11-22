interface TransactionModalProps {
  isOpen: boolean
  status: 'loading' | 'success' | 'error'
  onClose: () => void
  blockExplorerUrl?: string
  mode?: 'lend' | 'withdraw'
}

function TransactionModal({
  isOpen,
  status,
  onClose,
  blockExplorerUrl,
  mode,
}: TransactionModalProps) {
  if (!isOpen) return null

  const getStatusContent = () => {
    switch (status) {
      case 'loading':
        return {
          icon: (
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-gray-200"></div>
              <div className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
            </div>
          ),
          title: 'Transaction Pending',
          description:
            'Please wait while your transaction is being processed...',
          showClose: false,
        }
      case 'success':
        return {
          icon: (
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
          ),
          title: 'Transaction Successful',
          description:
            mode === 'withdraw'
              ? 'Your funds are now in your wallet'
              : 'Your funds are now earning interest',
          showClose: true,
        }
      case 'error':
        return {
          icon: (
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
          ),
          title: 'Transaction Failed',
          description: '',
          showClose: true,
        }
    }
  }

  const content = getStatusContent()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && content.showClose) {
          onClose()
        }
      }}
    >
      <div
        className="relative bg-white rounded-2xl shadow-xl"
        style={{
          width: '90%',
          maxWidth: '400px',
          padding: '32px',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        }}
      >
        {content.showClose && (
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

        <div className="flex flex-col items-center text-center">
          <div className="mb-6">{content.icon}</div>

          <h2
            className="mb-2"
            style={{
              color: '#1a1b1e',
              fontSize: '20px',
              fontWeight: 600,
            }}
          >
            {content.title}
          </h2>

          {content.description && (
            <p
              className="mb-6"
              style={{
                color: '#666666',
                fontSize: '14px',
                lineHeight: '20px',
              }}
            >
              {content.description}
            </p>
          )}

          {status === 'success' && blockExplorerUrl && (
            <a
              href={blockExplorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 mb-6 hover:opacity-80 transition-opacity"
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

          {content.showClose && (
            <button
              onClick={onClose}
              className="mt-6 w-full py-3 px-4 font-medium transition-all hover:opacity-90"
              style={{
                backgroundColor: '#0000008F',
                color: '#FFFFFF',
                fontSize: '16px',
                borderRadius: '12px',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default TransactionModal

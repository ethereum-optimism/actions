interface ActivityLogItemProps {
  type: 'lend' | 'withdraw'
  amount: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'failed'
}

function ActivityLogItem({ type, amount, timestamp, status }: ActivityLogItemProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'confirmed':
        return '#22C55E'
      case 'pending':
        return '#F59E0B'
      case 'failed':
        return '#EF4444'
      default:
        return '#666666'
    }
  }

  const getStatusText = () => {
    switch (status) {
      case 'confirmed':
        return 'Confirmed'
      case 'pending':
        return 'Pending'
      case 'failed':
        return 'Failed'
      default:
        return ''
    }
  }

  return (
    <div
      className="p-4 rounded-lg mb-3"
      style={{
        backgroundColor: '#F9FAFB',
        border: '1px solid #E5E7EB'
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{
              backgroundColor: type === 'lend' ? '#DBEAFE' : '#FEE2E2'
            }}
          >
            {type === 'lend' ? (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3B82F6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
              </svg>
            )}
          </div>
          <div>
            <div
              className="font-medium"
              style={{ color: '#1a1b1e', fontSize: '14px' }}
            >
              {type === 'lend' ? 'Lend' : 'Withdraw'}
            </div>
            <div style={{ color: '#9CA3AF', fontSize: '12px' }}>
              {timestamp}
            </div>
          </div>
        </div>
        <div
          className="text-right"
        >
          <div
            className="font-semibold"
            style={{ color: '#1a1b1e', fontSize: '14px' }}
          >
            {type === 'lend' ? '+' : '-'}{amount} USDC
          </div>
          <div
            className="text-xs font-medium"
            style={{ color: getStatusColor() }}
          >
            {getStatusText()}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ActivityLogItem

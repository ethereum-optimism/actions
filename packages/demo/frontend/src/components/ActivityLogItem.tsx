interface ActivityLogItemProps {
  type: 'lend' | 'withdraw' | 'fund' | 'wallet' | 'markets'
  action: string
  amount: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'error'
}

// Map action types to API method calls
const getApiMethod = (type: ActivityLogItemProps['type'], action: string) => {
  switch (type) {
    case 'wallet':
      return action === 'Get wallet balance' ? 'actionsApi.getWalletBalance()' : 'actionsApi.createWallet()'
    case 'fund':
      return 'actionsApi.fundWallet()'
    case 'markets':
      return 'actionsApi.getMarkets()'
    case 'lend':
      return 'actionsApi.openLendPosition()'
    case 'withdraw':
      return 'actionsApi.closeLendPosition()'
    default:
      return 'actionsApi()'
  }
}

function ActivityLogItem({ type, action, status }: ActivityLogItemProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'confirmed':
        return '#22C55E'
      case 'pending':
        return '#F59E0B'
      case 'error':
        return '#EF4444'
      default:
        return '#666666'
    }
  }


  const getTypeLabel = () => {
    switch (type) {
      case 'lend':
        return 'Lend'
      case 'withdraw':
        return 'Withdraw'
      case 'fund':
        return 'Fund'
      case 'wallet':
        return 'Wallet'
      case 'markets':
        return 'Markets'
      default:
        return type
    }
  }

  const getActionDescription = () => {
    // Check specific actions first
    if (action === 'Get market') {
      return 'Get market APY'
    }
    if (action === 'Get wallet balance') {
      return 'Get balance'
    }
    if (action === 'deposit') {
      return 'Open lending position'
    }
    if (action === 'withdraw') {
      return 'Close lending position'
    }
    if (action === 'mint') {
      return 'Mint demo USDC'
    }
    if (action === 'create') {
      return 'Create smart wallet'
    }
    if (action === 'send') {
      return 'Send tokens'
    }

    // Fallback to type-based descriptions
    switch (type) {
      case 'lend':
        return 'Lending action'
      case 'withdraw':
        return 'Withdrawal action'
      case 'fund':
        return 'Funding action'
      case 'wallet':
        return 'Wallet action'
      case 'markets':
        return 'Get markets'
      default:
        return 'Action'
    }
  }

  const getTypeColor = () => {
    switch (type) {
      case 'lend':
        return { bg: '#DBEAFE', stroke: '#3B82F6' }
      case 'withdraw':
        return { bg: '#FEE2E2', stroke: '#EF4444' }
      case 'fund':
        return { bg: '#D1FAE5', stroke: '#10B981' }
      case 'wallet':
        return { bg: '#E0E7FF', stroke: '#6366F1' }
      case 'markets':
        return { bg: '#FEF3C7', stroke: '#F59E0B' }
      default:
        return { bg: '#F3F4F6', stroke: '#6B7280' }
    }
  }


  return (
    <div
      className="px-4 py-3 border-b hover:bg-gray-50 transition-colors"
      style={{
        borderColor: '#E5E7EB'
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Top row: Label badge + Action description */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: getTypeColor().bg,
                color: getTypeColor().stroke
              }}
            >
              {getTypeLabel()}
            </span>
            <span
              className="text-sm font-medium"
              style={{ color: '#1a1b1e' }}
            >
              {getActionDescription()}
            </span>
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getStatusColor() }}
            />
          </div>

          {/* Bottom row: API method call */}
          <div
            className="text-xs font-mono"
            style={{ color: '#6B7280' }}
          >
            {getApiMethod(type, action)}
          </div>
        </div>

        {/* Right side: Arrow link */}
        <button
          className="flex-shrink-0 p-1 hover:bg-gray-100 rounded transition-colors"
          style={{ color: '#9CA3AF' }}
          onClick={() => {
            // TODO: Open modal/panel with API payload details
            console.log('View details for', type)
          }}
        >
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
        </button>
      </div>
    </div>
  )
}

export default ActivityLogItem

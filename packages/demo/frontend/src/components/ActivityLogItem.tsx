interface ActivityLogItemProps {
  type: 'lend' | 'withdraw' | 'fund' | 'wallet'
  action: string
  amount: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'error'
}

const STATUS_CONFIG = {
  confirmed: { color: '#22C55E' },
  pending: { color: '#F59E0B' },
  error: { color: '#EF4444' },
} as const

const TYPE_CONFIG = {
  lend: {
    label: 'Lend',
    bg: '#DBEAFE',
    stroke: '#3B82F6',
  },
  withdraw: {
    label: 'Withdraw',
    bg: '#FEE2E2',
    stroke: '#EF4444',
  },
  fund: {
    label: 'Fund',
    bg: '#D1FAE5',
    stroke: '#10B981',
  },
  wallet: {
    label: 'Wallet',
    bg: '#E0E7FF',
    stroke: '#6366F1',
  },
} as const

// Consolidated configuration for all API methods
// Maps API method names to their logging configuration
type ActivityConfigEntry = {
  type: 'lend' | 'withdraw' | 'fund' | 'wallet'
  action: string
  description: string
  apiMethod: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getAmount?: (...args: any[]) => string
  isReadOnly?: boolean
}

export const ACTIVITY_CONFIG: Record<string, ActivityConfigEntry> = {
  // Lend operations
  getMarkets: {
    type: 'lend',
    action: 'getMarket',
    description: 'Get market',
    apiMethod: 'actions.lend.getMarket()',
    isReadOnly: true,
  },
  getPosition: {
    type: 'lend',
    action: 'getPosition',
    description: 'Get position',
    apiMethod: 'wallet.lend.getPosition()',
    isReadOnly: true,
  },
  openLendPosition: {
    type: 'lend',
    action: 'deposit',
    description: 'Open lending position',
    apiMethod: 'wallet.lend.openPosition()',
    getAmount: (_walletId: string, amount: number) => amount.toString(),
  },

  // Withdraw operations
  closeLendPosition: {
    type: 'withdraw',
    action: 'withdraw',
    description: 'Close lending position',
    apiMethod: 'wallet.lend.closePosition()',
    getAmount: (_walletId: string, amount: number) => amount.toString(),
  },

  // Fund operations
  fundWallet: {
    type: 'fund',
    action: 'mint',
    description: 'Mint demo USDC',
    apiMethod: 'wallet.fund()',
    getAmount: () => '100.00',
  },

  // Wallet operations
  getWalletBalance: {
    type: 'wallet',
    action: 'getBalance',
    description: 'Get wallet balance',
    apiMethod: 'wallet.getBalance()',
    isReadOnly: true,
  },
  sendTokens: {
    type: 'wallet',
    action: 'send',
    description: 'Send tokens',
    apiMethod: 'wallet.sendTokens()',
    getAmount: (_walletId: string, amount: number) => amount.toString(),
  },
  createSmartWallet: {
    type: 'wallet',
    action: 'create',
    description: 'Create smart wallet',
    apiMethod: 'actions.wallet.createSmartWallet()',
  },
}

// Helper to get action config by action name (for ActivityLogItem component)
const ACTION_CONFIG: Record<
  string,
  { description: string; apiMethod: string }
> = Object.values(ACTIVITY_CONFIG).reduce(
  (acc, config) => {
    acc[config.action] = {
      description: config.description,
      apiMethod: config.apiMethod,
    }
    return acc
  },
  {} as Record<string, { description: string; apiMethod: string }>,
)

function ActivityLogItem({ type, action, status }: ActivityLogItemProps) {
  const statusColor = STATUS_CONFIG[status]?.color || '#666666'
  const typeConfig = TYPE_CONFIG[type] || {
    label: type,
    bg: '#F3F4F6',
    stroke: '#6B7280',
  }
  const actionConfig = ACTION_CONFIG[action]

  const description = actionConfig?.description || `${typeConfig.label} action`
  const apiMethod = actionConfig?.apiMethod || 'actions()'

  return (
    <div
      className="px-4 py-3 border-b hover:bg-gray-50 transition-colors"
      style={{
        borderColor: '#E5E7EB',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Top row: Label badge + Action description */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="px-2 py-0.5 rounded text-xs font-medium"
              style={{
                backgroundColor: typeConfig.bg,
                color: typeConfig.stroke,
              }}
            >
              {typeConfig.label}
            </span>
            <span className="text-sm font-medium" style={{ color: '#1a1b1e' }}>
              {description}
            </span>
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: statusColor }}
            />
          </div>

          {/* Bottom row: API method call */}
          <div className="text-xs font-mono" style={{ color: '#6B7280' }}>
            {apiMethod}
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

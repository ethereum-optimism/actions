// TODO: Re-enable useState in next PR when expand functionality is restored
// import { useState } from 'react'

interface ActivityLogItemProps {
  type: 'lend' | 'withdraw' | 'fund' | 'wallet'
  action: string
  amount: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'error'
  request?: Record<string, unknown>
  response?: Record<string, unknown>
  blockExplorerUrl?: string
  isTransaction?: boolean
  isFromPreviousSession?: boolean
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
    label: 'Lend',
    bg: '#DBEAFE',
    stroke: '#3B82F6',
  },
  fund: {
    label: 'Fund',
    bg: '#D1FAE5',
    stroke: '#10B981',
  },
  wallet: {
    label: 'Wallet',
    bg: '#FEF3C7',
    stroke: '#F59E0B',
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
  { description: string; apiMethod: string; tooltip: string }
> = {
  getMarket: {
    description: 'Get market',
    apiMethod: 'actions.lend.getMarket()',
    tooltip: 'Fetches available lending markets',
  },
  getPosition: {
    description: 'Get position',
    apiMethod: 'wallet.lend.getPosition()',
    tooltip: "Returns a wallet's market positions",
  },
  deposit: {
    description: 'Open lending position',
    apiMethod: 'wallet.lend.openPosition()',
    tooltip: 'Opens a new lending position',
  },
  withdraw: {
    description: 'Close lending position',
    apiMethod: 'wallet.lend.closePosition()',
    tooltip: 'Closes an existing lending position',
  },
  mint: {
    description: 'Mint demo USDC',
    apiMethod: 'wallet.fund()',
    tooltip: 'Funds a wallet with demo tokens',
  },
  getBalance: {
    description: 'Get balance',
    apiMethod: 'wallet.getBalance()',
    tooltip: 'Retrieves wallet token balances',
  },
  send: {
    description: 'Send tokens',
    apiMethod: 'wallet.sendTokens()',
    tooltip: 'Transfers tokens to another address',
  },
  create: {
    description: 'Create smart wallet',
    apiMethod: 'actions.wallet.createSmartWallet()',
    tooltip: 'Creates a new smart wallet',
  },
}

function ActivityLogItem({
  type,
  action,
  status,
  request,
  response,
  blockExplorerUrl,
  isFromPreviousSession,
}: ActivityLogItemProps) {
  // TODO: Re-enable expand state in next PR when request/response data is improved
  // const [isExpanded, setIsExpanded] = useState(false)
  const isExpanded = false
  const statusColor = STATUS_CONFIG[status]?.color || '#666666'
  const typeConfig = TYPE_CONFIG[type] || {
    label: type,
    bg: '#F3F4F6',
    stroke: '#6B7280',
  }
  const actionConfig = ACTION_CONFIG[action]

  const description = actionConfig?.description || `${typeConfig.label} action`
  const apiMethod = actionConfig?.apiMethod || 'actions()'
  const tooltip = actionConfig?.tooltip

  // Use real data when available
  const displayRequest = request
  const displayResponse = response

  return (
    <div
      className="border-b transition-colors"
      style={{
        borderColor: '#E5E7EB',
      }}
    >
      <div
        className="px-4 py-3 hover:bg-gray-50"
        style={{
          opacity: isFromPreviousSession ? 0.6 : 1,
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
              <span
                className="text-sm font-medium"
                style={{ color: '#1a1b1e' }}
              >
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

          {/* Right side: Block Explorer link, Clock icon - aligned with top row */}
          <div
            className="flex items-center gap-0.5"
            style={{ marginTop: '1px', marginRight: '-2px' }}
          >
            {blockExplorerUrl && (
              <a
                href={blockExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 hover:bg-gray-100 rounded transition-all"
                style={{ color: '#9CA3AF', padding: '2px' }}
                title="View on Block Explorer"
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
              </a>
            )}
            {isFromPreviousSession && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9CA3AF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            )}
            {/* TODO: Re-enable expand button in next PR when request/response data is improved */}
            {/* <button
              className="flex-shrink-0 p-1 hover:bg-gray-100 rounded transition-all"
              style={{ color: '#9CA3AF' }}
              onClick={() => setIsExpanded(!isExpanded)}
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
                style={{
                  transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}
              >
                <path d="M6 9l6 6 6-6"></path>
              </svg>
            </button> */}
          </div>
        </div>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div
          className="px-4 pb-4 space-y-3"
          style={{ backgroundColor: '#F9FAFB' }}
        >
          {/* Description */}
          {tooltip && (
            <div className="text-xs pt-2" style={{ color: '#1F2937' }}>
              {tooltip}
            </div>
          )}

          {/* Params */}
          {displayRequest && (
            <div>
              <div
                className="text-xs font-semibold mb-1"
                style={{ color: '#6B7280' }}
              >
                Params
              </div>
              <pre
                className="text-xs p-2 rounded overflow-x-auto"
                style={{
                  backgroundColor: '#1F2937',
                  color: '#D1D5DB',
                  fontFamily: 'monospace',
                }}
              >
                {JSON.stringify(displayRequest, null, 2)}
              </pre>
            </div>
          )}

          {/* Response */}
          {status === 'confirmed' && displayResponse && (
            <div>
              <div
                className="text-xs font-semibold mb-1"
                style={{ color: '#6B7280' }}
              >
                Response
              </div>
              <pre
                className="text-xs p-2 rounded overflow-x-auto"
                style={{
                  backgroundColor: '#1F2937',
                  color: '#D1D5DB',
                  fontFamily: 'monospace',
                }}
              >
                {JSON.stringify(displayResponse, null, 2)}
              </pre>
            </div>
          )}

          {/* Block Explorer Link */}
          {status === 'confirmed' && blockExplorerUrl && (
            <div>
              <a
                href={blockExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs flex items-center gap-1 hover:underline"
                style={{ color: '#3B82F6' }}
              >
                View on Block Explorer
                <svg
                  width="12"
                  height="12"
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
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ActivityLogItem

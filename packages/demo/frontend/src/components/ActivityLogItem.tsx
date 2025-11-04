// TODO: Re-enable useState in next PR when expand functionality is restored
import { useState, useRef, useEffect } from 'react'
import { ACTIVITY_CONFIG } from '../constants/activityLogConfigs'
import { useActivityHighlight } from '../contexts/ActivityHighlightContext'
import { colors } from '../constants/colors'

interface ActivityLogItemProps {
  type: 'lend' | 'withdraw' | 'fund' | 'wallet'
  action: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'error'
  blockExplorerUrl?: string
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

function ActivityLogItem({
  type,
  action,
  status,
  blockExplorerUrl,
  isFromPreviousSession,
}: ActivityLogItemProps) {
  // TODO: Re-enable expand state in next PR when request/response data is improved
  // const [isExpanded, setIsExpanded] = useState(false)
  const isExpanded = false
  const [showStatusTooltip, setShowStatusTooltip] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const statusRef = useRef<HTMLDivElement>(null)
  const { setHoveredAction } = useActivityHighlight()

  useEffect(() => {
    if (showStatusTooltip && statusRef.current) {
      const rect = statusRef.current.getBoundingClientRect()
      setTooltipPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      })
    }
  }, [showStatusTooltip])
  const statusColor = STATUS_CONFIG[status]?.color || '#666666'
  const typeConfig = TYPE_CONFIG[type] || {
    label: type,
    bg: '#F3F4F6',
    stroke: '#6B7280',
  }

  // Look up the activity config by action key
  const actionConfig = ACTIVITY_CONFIG[action]

  const description = actionConfig?.description || `${typeConfig.label} action`
  const apiMethod = actionConfig?.apiMethod || 'actions()'
  const tooltip = actionConfig?.tooltip
  const isReadOnly = actionConfig?.isReadOnly

  // Status tooltip based on whether it's a read or write operation
  const getStatusTooltip = () => {
    if (isReadOnly) {
      switch (status) {
        case 'confirmed':
          return 'Request succeeded'
        case 'pending':
          return 'Awaiting request'
        case 'error':
          return 'Request failed'
      }
    } else {
      switch (status) {
        case 'confirmed':
          return 'Transaction succeeded'
        case 'pending':
          return 'Transaction pending'
        case 'error':
          return 'Transaction failed'
      }
    }
  }

  // Use real data when available
  const displayRequest = { request: 'john' }
  const displayResponse = { response: 'doe' }

  return (
    <>
      <div
        className="border-b transition-colors"
        style={{
          borderColor: '#E5E7EB',
        }}
      >
        <div
          className="px-4 py-3 transition-all"
          style={{
            opacity: isFromPreviousSession ? 0.6 : 1,
            borderLeft: '3px solid transparent',
          }}
          onMouseEnter={(e) => {
            setHoveredAction(action)
            e.currentTarget.style.borderLeftColor = colors.highlight.border
            e.currentTarget.style.backgroundColor = colors.highlight.background
          }}
          onMouseLeave={(e) => {
            setHoveredAction(null)
            e.currentTarget.style.borderLeftColor = 'transparent'
            e.currentTarget.style.backgroundColor = ''
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Top row: Label badge + Action description */}
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="px-2 py-0.5 rounded-sm text-xs font-medium"
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
                  ref={statusRef}
                  onMouseEnter={() => setShowStatusTooltip(true)}
                  onMouseLeave={() => setShowStatusTooltip(false)}
                  style={{
                    display: 'inline-flex',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: statusColor }}
                  />
                </div>
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
                  className="flex-shrink-0 hover:bg-gray-100 rounded-sm transition-all"
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
              className="flex-shrink-0 p-1 hover:bg-gray-100 rounded-sm transition-all"
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
                  className="text-xs p-2 rounded-sm overflow-x-auto"
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
                  className="text-xs p-2 rounded-sm overflow-x-auto"
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
      {showStatusTooltip && (
        <div
          style={{
            position: 'fixed',
            top: `${tooltipPos.top}px`,
            left: `${tooltipPos.left}px`,
            transform: 'translate(-50%, -100%)',
            padding: '8px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.56)',
            color: '#FFFFFF',
            fontSize: '12px',
            borderRadius: '6px',
            whiteSpace: 'nowrap',
            zIndex: 9999,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            pointerEvents: 'none',
          }}
        >
          {getStatusTooltip()}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderTop: '4px solid rgba(0, 0, 0, 0.56)',
            }}
          />
        </div>
      )}
    </>
  )
}

export default ActivityLogItem

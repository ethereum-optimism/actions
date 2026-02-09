import { useState } from 'react'
import type { ActivityEntry } from '../../providers/ActivityLogProvider'

interface ActivityFeedItemProps {
  activity: ActivityEntry
  formatTimestamp: (timestamp: string) => string
}

function getAssetLogo(symbol?: string): string {
  if (!symbol) return '/usdc-logo.svg'
  const clean = symbol.replace('_DEMO', '').toUpperCase()
  if (clean === 'ETH' || clean === 'WETH') return '/eth-logo.svg'
  if (clean === 'OP') return '/op-logo.svg'
  return '/usdc-logo.svg'
}

function getSummary(activity: ActivityEntry): {
  text: string
  icons: string[]
} {
  const meta = activity.metadata
  const amount = meta?.amount
  const symbol = meta?.assetSymbol || ''
  const toSymbol = meta?.toAssetSymbol || ''
  const toAmount = meta?.toAmount || ''

  switch (activity.action) {
    case 'swap':
      return {
        text: `Swapped ${amount ?? ''} ${symbol} → ${toAmount} ${toSymbol}`,
        icons: [getAssetLogo(symbol), getAssetLogo(toSymbol)],
      }
    case 'deposit':
      return {
        text: `Lent ${amount ?? ''} ${symbol}${meta?.marketName ? ` to ${meta.marketName}` : ''}`,
        icons: [
          getAssetLogo(symbol),
          ...(meta?.marketLogo ? [meta.marketLogo] : []),
        ],
      }
    case 'withdraw':
      return {
        text: `Withdrew ${amount ?? ''} ${symbol}${meta?.marketName ? ` from ${meta.marketName}` : ''}`,
        icons: [
          getAssetLogo(symbol),
          ...(meta?.marketLogo ? [meta.marketLogo] : []),
        ],
      }
    case 'mint':
      return {
        text: `Minted ${symbol || 'tokens'}`,
        icons: [getAssetLogo(symbol)],
      }
    default:
      return {
        text: activity.action,
        icons: [],
      }
  }
}

function ActivityFeedItem({
  activity,
  formatTimestamp,
}: ActivityFeedItemProps) {
  const [expanded, setExpanded] = useState(false)
  const { text, icons } = getSummary(activity)

  return (
    <div
      style={{
        borderBottom: '1px solid #E0E2EB',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          padding: '16px 24px',
          border: 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
          gap: '8px',
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: '14px',
            fontWeight: 400,
            color: '#1a1b1e',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flexWrap: 'wrap',
          }}
        >
          {renderSummaryWithIcons(text, icons)}
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="#9195A6"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {expanded && (
        <div
          style={{
            padding: '0 24px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '13px',
          }}
        >
          <div className="flex justify-between">
            <span style={{ color: '#9195A6' }}>Status</span>
            <span
              style={{
                color:
                  activity.status === 'confirmed'
                    ? '#22C55E'
                    : activity.status === 'error'
                      ? '#EF4444'
                      : '#F59E0B',
                fontWeight: 500,
              }}
            >
              {activity.status === 'confirmed'
                ? 'Confirmed'
                : activity.status === 'error'
                  ? 'Failed'
                  : 'Pending'}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: '#9195A6' }}>Time</span>
            <span style={{ color: '#1a1b1e' }}>
              {formatTimestamp(activity.timestamp)}
            </span>
          </div>
          {activity.blockExplorerUrl && (
            <div className="flex justify-between">
              <span style={{ color: '#9195A6' }}>Transaction</span>
              <a
                href={activity.blockExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#3374DB',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                View on Explorer &nearr;
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function renderSummaryWithIcons(
  text: string,
  icons: string[],
): React.ReactNode {
  if (icons.length === 0) return text

  // Insert icons inline after relevant tokens
  const parts = text.split(/(\s→\s)/)
  const result: React.ReactNode[] = []
  let iconIdx = 0

  for (let i = 0; i < parts.length; i++) {
    result.push(parts[i])
    // Insert icon after first token mention (before arrow) and after second (after arrow)
    if (
      (i === 0 || parts[i] === ' → ') &&
      iconIdx < icons.length &&
      parts[i] !== ' → '
    ) {
      result.push(
        <img
          key={`icon-${iconIdx}`}
          src={icons[iconIdx]}
          alt=""
          style={{
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            verticalAlign: 'middle',
            display: 'inline',
          }}
        />,
      )
      iconIdx++
    } else if (parts[i] === ' → ' && iconIdx < icons.length) {
      // Will add icon after next part
    }
  }

  // Add remaining icons at end
  while (iconIdx < icons.length) {
    result.push(
      <img
        key={`icon-${iconIdx}`}
        src={icons[iconIdx]}
        alt=""
        style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          verticalAlign: 'middle',
          display: 'inline',
        }}
      />,
    )
    iconIdx++
  }

  return result
}

export default ActivityFeedItem

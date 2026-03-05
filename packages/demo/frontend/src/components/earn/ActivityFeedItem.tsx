import { useState } from 'react'
import type { ActivitySummary, SummarySegment } from '@/utils/activitySummary'

const CHAIN_DISPLAY: Record<number, { name: string; logo: string }> = {
  84532: { name: 'Base Sepolia', logo: '/base-logo.svg' },
  11155420: { name: 'OP Sepolia', logo: '/op-logo.svg' },
  130: { name: 'Unichain', logo: '/unichain-logo.svg' },
}

const DEFAULT_CHAIN = { name: 'Base Sepolia', logo: '/base-logo.svg' }

interface ActivityFeedItemProps {
  summary: ActivitySummary
  timestamp: string
  blockExplorerUrl?: string
  status: 'pending' | 'confirmed' | 'error'
  chainId?: number
}

function SummaryRenderer({ segments }: { segments: SummarySegment[] }) {
  return (
    <span>
      {segments.map((segment, i) =>
        segment.type === 'token' ? (
          <span key={i}>
            <img
              src={segment.logo}
              alt={segment.symbol}
              style={{
                width: '14px',
                height: '14px',
                borderRadius: segment.round !== false ? '50%' : '0',
                display: 'inline',
                verticalAlign: '-2px',
                marginRight: '3px',
              }}
            />
            {segment.symbol}
          </span>
        ) : (
          <span key={i}>{segment.value}</span>
        ),
      )}
    </span>
  )
}

export function ActivityFeedItem({
  summary,
  timestamp,
  blockExplorerUrl,
  status,
  chainId,
}: ActivityFeedItemProps) {
  const [expanded, setExpanded] = useState(false)
  const chain = chainId ? CHAIN_DISPLAY[chainId] ?? DEFAULT_CHAIN : DEFAULT_CHAIN

  return (
    <div style={{ borderBottom: '1px solid #E0E2EB' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '16px 24px',
          border: 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          fontFamily: 'Inter',
          textAlign: 'left',
          fontSize: '14px',
          color: '#1a1b1e',
          fontWeight: 400,
        }}
      >
        <SummaryRenderer segments={summary.segments} />
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            flexShrink: 0,
            marginLeft: '12px',
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
                  status === 'confirmed'
                    ? '#22C55E'
                    : status === 'error'
                      ? '#EF4444'
                      : '#F59E0B',
                fontWeight: 500,
              }}
            >
              {status === 'confirmed'
                ? 'Confirmed'
                : status === 'error'
                  ? 'Failed'
                  : 'Pending'}
            </span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: '#9195A6' }}>Time</span>
            <span style={{ color: '#1a1b1e' }}>{timestamp}</span>
          </div>
          <div className="flex justify-between">
            <span style={{ color: '#9195A6' }}>Network</span>
            <span
              className="flex items-center gap-1"
              style={{ color: '#1a1b1e' }}
            >
              <img
                src={chain.logo}
                alt={chain.name}
                style={{ width: '14px', height: '14px' }}
              />
              {chain.name}
            </span>
          </div>
          {blockExplorerUrl && (
            <div className="flex justify-between">
              <span style={{ color: '#9195A6' }}>Transaction</span>
              <a
                href={blockExplorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#3374DB',
                  textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                View on explorer &rarr;
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

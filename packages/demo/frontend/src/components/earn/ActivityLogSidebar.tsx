import type { ReactNode } from 'react'
import { useState } from 'react'
import ActivityLogItem from './ActivityLogItem'
import ActivityLogIcon from '../icons/ActivityLogIcon'
import ArrowLine from '../icons/ArrowLine'
import { ActivityFeedList } from './ActivityFeedList'
import type { ActivityEntry } from '../../providers/ActivityLogProvider'

type SidebarTab = 'log' | 'activity'

const TABS: { key: SidebarTab; label: string }[] = [
  { key: 'log', label: 'Log' },
  { key: 'activity', label: 'Activity' },
]

function SidebarTabButton({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        padding: '16px 0',
        border: 'none',
        backgroundColor: 'transparent',
        fontSize: '16px',
        fontWeight: isActive ? 600 : 400,
        color: isActive ? '#1a1b1e' : '#9195A6',
        cursor: 'pointer',
        borderBottom: isActive ? '3px solid #1a1b1e' : '3px solid transparent',
        fontFamily: 'Inter',
        textAlign: 'center',
      }}
    >
      {label}
    </button>
  )
}

function FooterLink({
  href,
  icon,
  label,
  borderRight,
}: {
  href: string
  icon: ReactNode
  label: string
  borderRight?: boolean
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 transition-colors hover:opacity-70"
      style={{
        flex: 1,
        textDecoration: 'none',
        color: '#666666',
        fontSize: '13px',
        padding: '12px 0',
        ...(borderRight && { borderRight: '1px solid #E0E2EB' }),
      }}
    >
      {icon}
      {label}
    </a>
  )
}

const DocsIcon = (
  <svg
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
)

const GitHubIcon = (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
)

interface ActivityLogSidebarProps {
  activities: ActivityEntry[]
  formatTimestamp: (timestamp: string) => string
  onCollapsedChange?: (collapsed: boolean) => void
}

function ActivityLogSidebar({
  activities,
  formatTimestamp,
  onCollapsedChange,
}: ActivityLogSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showButton, setShowButton] = useState(false)
  const [activeTab, setActiveTab] = useState<SidebarTab>('log')

  const handleCollapse = (collapsed: boolean) => {
    setIsCollapsed(collapsed)
    onCollapsedChange?.(collapsed)

    if (collapsed) {
      setTimeout(() => {
        setShowButton(true)
      }, 150)
    } else {
      setShowButton(false)
    }
  }

  return (
    <>
      {/* Show button (when collapsed) - slides in from right edge */}
      <button
        onClick={() => handleCollapse(false)}
        className="fixed hover:bg-gray-100 rounded-l-lg transition-transform duration-300 ease-in-out z-40"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E0E2EB',
          borderRight: 'none',
          color: '#636779',
          right: 0,
          top: '56px',
          height: '55px',
          width: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: showButton ? 'translateX(0)' : 'translateX(100%)',
        }}
        aria-label="Expand Log"
      >
        <ActivityLogIcon width={20} height={20} color="#636779" />
      </button>

      <div
        className="flex flex-col h-full relative"
        style={{
          backgroundColor: '#FFFFFF',
          borderLeft: '1px solid #E0E2EB',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          width: '436px',
        }}
      >
        {/* Tab Header */}
        <div className="flex-shrink-0" style={{ position: 'relative' }}>
          {/* Collapse button - slides with sidebar */}
          <button
            onClick={() => handleCollapse(true)}
            className="fixed hover:bg-gray-100 rounded-l-lg z-40"
            style={{
              right: isCollapsed ? '0px' : '436px',
              top: '56px',
              height: '55px',
              width: '44px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E0E2EB',
              borderRight: 'none',
              color: '#636779',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'right 300ms ease-in-out',
              opacity: isCollapsed ? 0 : 1,
              pointerEvents: isCollapsed ? 'none' : 'auto',
            }}
            aria-label="Collapse sidebar"
          >
            <ArrowLine
              width={20}
              height={20}
              color="#636779"
              direction="right"
            />
          </button>
          <div className="flex">
            {TABS.map((tab) => (
              <SidebarTabButton
                key={tab.key}
                label={tab.label}
                isActive={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              />
            ))}
          </div>
          <div style={{ borderBottom: '1px solid #E0E2EB' }} />
        </div>

        {/* Content */}
        <div
          className="flex-1"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#D1D5DB #F3F4F6',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'visible',
          }}
        >
          {activeTab === 'log' ? (
            activities.length > 0 ? (
              activities.map((activity) => (
                <ActivityLogItem
                  key={activity.id}
                  type={activity.type}
                  action={activity.action}
                  timestamp={formatTimestamp(activity.timestamp)}
                  status={activity.status}
                  blockExplorerUrl={activity.blockExplorerUrl}
                  isFromPreviousSession={activity.isFromPreviousSession}
                />
              ))
            ) : (
              <div
                style={{
                  color: '#9CA3AF',
                  textAlign: 'center',
                  padding: '2rem',
                }}
              >
                No activity yet
              </div>
            )
          ) : (
            <ActivityFeedList
              activities={activities}
              formatTimestamp={formatTimestamp}
            />
          )}
        </div>

        {/* Minimal Footer */}
        <div
          className="flex-shrink-0"
          style={{ borderTop: '1px solid #E0E2EB' }}
        >
          <div className="flex" style={{ padding: '0' }}>
            <FooterLink
              href="https://docs.optimism.io/app-developers/quickstarts/actions"
              icon={DocsIcon}
              label="Docs"
              borderRight
            />
            <FooterLink
              href="https://github.com/ethereum-optimism/actions"
              icon={GitHubIcon}
              label="GitHub"
            />
          </div>
        </div>
      </div>
    </>
  )
}

export default ActivityLogSidebar

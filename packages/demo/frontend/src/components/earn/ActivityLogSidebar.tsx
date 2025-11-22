import { useState } from 'react'
import ActivityLogItem from './ActivityLogItem'
import ActivityLogIcon from '../icons/ActivityLogIcon'
import ArrowLine from '../icons/ArrowLine'
import Info from './Info'
import type { ActivityEntry } from '../../providers/ActivityLogProvider'

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
  const [showButton, setShowButton] = useState(false)

  const handleCollapse = (collapsed: boolean) => {
    onCollapsedChange?.(collapsed)

    if (collapsed) {
      // Show button shortly after sidebar starts collapsing
      setTimeout(() => {
        setShowButton(true)
      }, 150)
    } else {
      // Hide button immediately when expanding
      setShowButton(false)
    }
  }

  return (
    <>
      <button
        onClick={() => handleCollapse(false)}
        className="fixed top-24 p-3 hover:bg-gray-100 rounded-l-lg transition-all duration-300 ease-in-out shadow-md z-50"
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #E0E2EB',
          borderRight: 'none',
          color: '#636779',
          right: 0,
          transform: showButton ? 'translateX(0)' : 'translateX(100%)',
        }}
        aria-label="Expand Under the Hood"
      >
        <ActivityLogIcon width={20} height={20} color="#636779" />
      </button>
      <div
        className="flex flex-col h-full transition-all duration-300 ease-in-out relative overflow-hidden"
        style={{
          backgroundColor: '#FFFFFF',
          borderLeft: '1px solid #E0E2EB',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          width: '436px',
        }}
      >
        <div
          className="flex-shrink-0"
          style={{ padding: '1.5rem', paddingBottom: 0 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ActivityLogIcon />
              <h2
                className="text-lg font-semibold"
                style={{ color: '#1a1b1e' }}
              >
                Under the Hood
              </h2>
            </div>
            <button
              onClick={() => handleCollapse(true)}
              className="p-2 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
              style={{ color: '#636779' }}
              aria-label="Collapse Under the Hood"
            >
              <ArrowLine width={20} height={20} direction="right" />
            </button>
          </div>
        </div>

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
          {activities.length > 0 ? (
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
          )}
        </div>

        <div className="mt-auto">
          <div style={{ borderTop: '1px solid #E0E2EB' }} />
          <div
            style={{
              padding: '1.5rem',
              paddingTop: '1.5rem',
            }}
          >
            <Info />
          </div>
        </div>
      </div>
    </>
  )
}

export default ActivityLogSidebar

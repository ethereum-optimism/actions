import { useState } from 'react'
import ActivityLogItem from './ActivityLogItem'
import ActivityFeedList from './ActivityFeedList'
import ArrowLine from '../icons/ArrowLine'
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
  const [activeTab, setActiveTab] = useState<'log' | 'activity'>('log')

  const handleCollapse = (collapsed: boolean) => {
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
        aria-label="Expand sidebar"
      >
        <ArrowLine width={20} height={20} direction="left" />
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
        {/* Tab Header */}
        <div
          className="flex-shrink-0"
          style={{ borderBottom: '1px solid #E0E2EB' }}
        >
          <div className="flex items-center">
            <button
              onClick={() => setActiveTab('log')}
              style={{
                flex: 1,
                padding: '16px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: activeTab === 'log' ? '#1a1b1e' : '#9195A6',
                borderBottom:
                  activeTab === 'log'
                    ? '2px solid #1a1b1e'
                    : '2px solid transparent',
                fontFamily: 'Inter',
              }}
            >
              Log
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              style={{
                flex: 1,
                padding: '16px',
                border: 'none',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                color: activeTab === 'activity' ? '#1a1b1e' : '#9195A6',
                borderBottom:
                  activeTab === 'activity'
                    ? '2px solid #1a1b1e'
                    : '2px solid transparent',
                fontFamily: 'Inter',
              }}
            >
              Activity
            </button>
            <button
              onClick={() => handleCollapse(true)}
              className="p-2 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
              style={{ color: '#636779', marginRight: '12px' }}
              aria-label="Collapse sidebar"
            >
              <ArrowLine width={20} height={20} direction="right" />
            </button>
          </div>
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
      </div>
    </>
  )
}

export default ActivityLogSidebar

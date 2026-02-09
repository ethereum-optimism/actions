import { useState } from 'react'
import ActivityLogItem from './ActivityLogItem'
import ActivityFeedList from './ActivityFeedList'
import type { ActivityEntry } from '../../providers/ActivityLogProvider'

interface ActivityLogCardProps {
  activities: ActivityEntry[]
  formatTimestamp: (timestamp: string) => string
  hasMoreActivities: boolean
  onViewFullLog: () => void
}

function ActivityLogCard({
  activities,
  formatTimestamp,
  hasMoreActivities,
  onViewFullLog,
}: ActivityLogCardProps) {
  const [activeTab, setActiveTab] = useState<'log' | 'activity'>('log')
  const displayedActivities = activities.slice(0, 3)

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '24px',
        boxShadow: '0 1px 4px rgba(0, 0, 0, 0.06)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Tab Header */}
      <div style={{ borderBottom: '1px solid #E0E2EB' }}>
        <div className="flex">
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
        </div>
      </div>

      {/* Content */}
      <div
        className="overflow-y-auto max-h-96"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#D1D5DB #F3F4F6',
        }}
      >
        {activeTab === 'log' ? (
          activities.length > 0 ? (
            displayedActivities.map((activity) => (
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

      {activeTab === 'log' && hasMoreActivities && (
        <div className="p-4 pt-0">
          <button
            onClick={onViewFullLog}
            className="w-full py-3 text-center font-medium transition-colors"
            style={{
              color: '#1a1b1e',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            View Full Log
          </button>
        </div>
      )}
    </div>
  )
}

export default ActivityLogCard

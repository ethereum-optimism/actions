import ActivityLogItem from './ActivityLogItem'
import ActivityLogIcon from '../icons/ActivityLogIcon'
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
  const displayedActivities = activities.slice(0, 3)

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div className="p-6 pb-0">
        <div className="flex items-center gap-2 mb-4">
          <ActivityLogIcon />
          <h2 className="text-lg font-semibold" style={{ color: '#1a1b1e' }}>
            Under the Hood
          </h2>
        </div>
      </div>

      <div
        className="overflow-y-auto max-h-96"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#D1D5DB #F3F4F6',
        }}
      >
        {activities.length > 0 ? (
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
        )}
      </div>

      {hasMoreActivities && (
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

import ActivityLogItem from './ActivityLogItem'
import ActivityLogIcon from '../icons/ActivityLogIcon'
import Info from './Info'
import type { ActivityEntry } from '../../providers/ActivityLogProvider'

interface ActivityLogSidebarProps {
  activities: ActivityEntry[]
  formatTimestamp: (timestamp: string) => string
}

function ActivityLogSidebar({
  activities,
  formatTimestamp,
}: ActivityLogSidebarProps) {
  return (
    <div
      className="flex flex-col h-full"
      style={{
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E0E2EB',
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
        <div className="p-6 pt-6">
          <Info />
        </div>
      </div>
    </div>
  )
}

export default ActivityLogSidebar

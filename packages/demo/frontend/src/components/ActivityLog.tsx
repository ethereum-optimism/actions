import ActivityLogItem from './ActivityLogItem'
import Info from './Info'
import { useActivityLog } from '../contexts/ActivityLogContext'

function ActivityLog() {
  const { activities } = useActivityLog()

  // Helper function to format timestamp
  const formatTimestamp = (isoString: string) => {
    const date = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }

  return (
    <div
      className="h-full flex flex-col overflow-y-auto"
      style={{
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E0E2EB',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1a1b1e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <h2 className="text-lg font-semibold" style={{ color: '#1a1b1e' }}>
            Activity Log
          </h2>
        </div>

        <div>
          {activities.length > 0 ? (
            activities.map((activity) => (
              <ActivityLogItem
                key={activity.id}
                type={activity.type}
                action={activity.action}
                amount={activity.amount || '0'}
                timestamp={formatTimestamp(activity.timestamp)}
                status={activity.status}
                request={activity.request}
                response={activity.response}
                blockExplorerUrl={activity.blockExplorerUrl}
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
      </div>

      {/* Info section at bottom */}
      <div className="mt-auto p-6">
        <Info />
      </div>
    </div>
  )
}

export default ActivityLog

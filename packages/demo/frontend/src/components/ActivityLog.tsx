import ActivityLogItem from './ActivityLogItem'
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
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  }

  return (
    <div
      className="h-full p-6 overflow-y-auto"
      style={{
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E0E2EB',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}
    >
      <h2
        className="text-lg font-semibold mb-4"
        style={{ color: '#1a1b1e' }}
      >
        Activity Log
      </h2>

      <div>
        {activities.length > 0 ? (
          activities.map((activity) => (
            <ActivityLogItem
              key={activity.id}
              type={activity.type}
              amount={activity.amount || '0'}
              timestamp={formatTimestamp(activity.timestamp)}
              status={activity.status}
            />
          ))
        ) : (
          <div style={{ color: '#9CA3AF', textAlign: 'center', padding: '2rem' }}>
            No activity yet
          </div>
        )}
      </div>
    </div>
  )
}

export default ActivityLog
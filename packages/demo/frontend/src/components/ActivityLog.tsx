import ActivityLogItem from './ActivityLogItem'
import Info from './Info'
import { useActivityLog } from '../hooks/useActivityLog'

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
      className="h-full flex flex-col"
      style={{
        backgroundColor: '#FFFFFF',
        borderLeft: '1px solid #E0E2EB',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div className="p-6 pb-0">
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
            Under the Hood
          </h2>
        </div>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#D1D5DB #F3F4F6',
        }}
      >
        <style>{`
          .activity-log-scroll::-webkit-scrollbar {
            width: 8px;
          }
          .activity-log-scroll::-webkit-scrollbar-track {
            background: #F3F4F6;
          }
          .activity-log-scroll::-webkit-scrollbar-thumb {
            background: #D1D5DB;
            border-radius: 4px;
          }
          .activity-log-scroll::-webkit-scrollbar-thumb:hover {
            background: #9CA3AF;
          }
        `}</style>
        <div className="activity-log-scroll">
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
      </div>

      {/* Info section at bottom */}
      <div className="mt-auto">
        <div style={{ borderTop: '1px solid #E0E2EB' }} />
        <div className="p-6 pt-6">
          <Info />
        </div>
      </div>
    </div>
  )
}

export default ActivityLog

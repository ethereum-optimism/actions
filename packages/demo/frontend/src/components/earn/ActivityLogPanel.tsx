import ActivityLogItem from './ActivityLogItem'
import ActivityLogIcon from '../icons/ActivityLogIcon'
import CloseIcon from '../icons/CloseIcon'
import type { ActivityEntry } from '../../providers/ActivityLogProvider'

interface ActivityLogPanelProps {
  activities: ActivityEntry[]
  formatTimestamp: (timestamp: string) => string
  isOpen: boolean
  onClose: () => void
}

function ActivityLogPanel({
  activities,
  formatTimestamp,
  isOpen,
  onClose,
}: ActivityLogPanelProps) {
  if (!isOpen) return null

  return (
    <div
      className="lg:hidden fixed inset-0 z-50"
      style={{
        backgroundColor: '#FFFFFF',
        animation: 'slideInRight 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>

      {/* Header */}
      <div
        className="flex items-center justify-between p-4"
        style={{
          borderBottom: '1px solid #E0E2EB',
        }}
      >
        <div className="flex items-center gap-2">
          <ActivityLogIcon />
          <h2 className="text-lg font-semibold" style={{ color: '#1a1b1e' }}>
            Activity Log
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <CloseIcon />
        </button>
      </div>

      {/* Full Activity List */}
      <div
        className="overflow-y-auto"
        style={{
          height: 'calc(100vh - 65px)',
          scrollbarWidth: 'thin',
          scrollbarColor: '#D1D5DB #F3F4F6',
        }}
      >
        {activities.map((activity) => (
          <ActivityLogItem
            key={activity.id}
            type={activity.type}
            action={activity.action}
            timestamp={formatTimestamp(activity.timestamp)}
            status={activity.status}
            blockExplorerUrl={activity.blockExplorerUrl}
            isFromPreviousSession={activity.isFromPreviousSession}
          />
        ))}
      </div>
    </div>
  )
}

export default ActivityLogPanel

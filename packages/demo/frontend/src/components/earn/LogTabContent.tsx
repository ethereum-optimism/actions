import type { ActivityEntry } from '@/providers/ActivityLogProvider'
import LogItem from './LogItem'
import { ActivityList } from './ActivityList'

interface LogTabContentProps {
  activeTab: 'log' | 'activity'
  activities: ActivityEntry[]
  displayActivities: ActivityEntry[]
  formatTimestamp: (timestamp: string) => string
}

export function LogTabContent({
  activeTab,
  activities,
  displayActivities,
  formatTimestamp,
}: LogTabContentProps) {
  if (activeTab === 'activity') {
    return (
      <ActivityList activities={activities} formatTimestamp={formatTimestamp} />
    )
  }

  if (displayActivities.length === 0) {
    return (
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
  }

  return (
    <>
      {displayActivities.map((activity) => (
        <LogItem
          key={activity.id}
          type={activity.type}
          action={activity.action}
          timestamp={formatTimestamp(activity.timestamp)}
          status={activity.status}
          blockExplorerUrl={activity.blockExplorerUrl}
          isFromPreviousSession={activity.isFromPreviousSession}
        />
      ))}
    </>
  )
}

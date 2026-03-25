import type { ActivityEntry } from '@/providers/ActivityLogProvider'
import { ActivityItem } from './ActivityItem'
import {
  getActivitySummary,
  isSignedTransaction,
} from '@/utils/activitySummary'

interface ActivityListProps {
  activities: ActivityEntry[]
  formatTimestamp: (timestamp: string) => string
}

export function ActivityList({
  activities,
  formatTimestamp,
}: ActivityListProps) {
  const signedTransactions = activities.filter(isSignedTransaction)

  if (signedTransactions.length === 0) {
    return (
      <div
        style={{
          color: '#9CA3AF',
          textAlign: 'center',
          padding: '2rem',
          fontSize: '14px',
        }}
      >
        No transactions yet
      </div>
    )
  }

  return (
    <div>
      {signedTransactions.map((activity) => (
        <ActivityItem
          key={activity.id}
          summary={getActivitySummary(activity)}
          timestamp={formatTimestamp(activity.timestamp)}
          blockExplorerUrl={activity.blockExplorerUrl}
          status={activity.status}
          chainId={activity.metadata?.chainId}
        />
      ))}
    </div>
  )
}

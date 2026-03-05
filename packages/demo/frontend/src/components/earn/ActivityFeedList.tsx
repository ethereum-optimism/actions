import type { ActivityEntry } from '@/providers/ActivityLogProvider'
import { ActivityFeedItem } from './ActivityFeedItem'
import {
  getActivitySummary,
  isSignedTransaction,
} from '@/utils/activitySummary'

interface ActivityFeedListProps {
  activities: ActivityEntry[]
  formatTimestamp: (timestamp: string) => string
}

export function ActivityFeedList({
  activities,
  formatTimestamp,
}: ActivityFeedListProps) {
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
        <ActivityFeedItem
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

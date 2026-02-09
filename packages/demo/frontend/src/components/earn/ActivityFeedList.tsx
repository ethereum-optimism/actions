import type { ActivityEntry } from '../../providers/ActivityLogProvider'
import ActivityFeedItem from './ActivityFeedItem'

interface ActivityFeedListProps {
  activities: ActivityEntry[]
  formatTimestamp: (timestamp: string) => string
}

function ActivityFeedList({
  activities,
  formatTimestamp,
}: ActivityFeedListProps) {
  // Only show activities that have transactions (blockExplorerUrl)
  const transactionActivities = activities.filter((a) => !!a.blockExplorerUrl)

  if (transactionActivities.length === 0) {
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
      {transactionActivities.map((activity) => (
        <ActivityFeedItem
          key={activity.id}
          activity={activity}
          formatTimestamp={formatTimestamp}
        />
      ))}
    </div>
  )
}

export default ActivityFeedList

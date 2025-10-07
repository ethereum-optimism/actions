import ActivityLogItem from './ActivityLogItem'

function ActivityLog() {
  // Sample data - replace with real data later
  const activities = [
    {
      id: 1,
      type: 'lend' as const,
      amount: '100.00',
      timestamp: '2 minutes ago',
      status: 'confirmed' as const
    },
    {
      id: 2,
      type: 'withdraw' as const,
      amount: '50.00',
      timestamp: '1 hour ago',
      status: 'confirmed' as const
    },
    {
      id: 3,
      type: 'lend' as const,
      amount: '200.00',
      timestamp: '3 hours ago',
      status: 'pending' as const
    }
  ]

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
              amount={activity.amount}
              timestamp={activity.timestamp}
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
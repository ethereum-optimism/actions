import { useState } from 'react'
import { useActivityLog } from '../../hooks/useActivityLog'
import ActivityLogCard from './ActivityLogCard'
import ActivityLogSidebar from './ActivityLogSidebar'
import ActivityLogPanel from './ActivityLogPanel'

interface ActivityLogProps {
  onCollapsedChange?: (collapsed: boolean) => void
}

function ActivityLog({ onCollapsedChange }: ActivityLogProps) {
  const { activities } = useActivityLog()
  const [isFullLogOpen, setIsFullLogOpen] = useState(false)

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

  const hasMoreActivities = activities.length > 3

  return (
    <>
      {/* Mobile Card */}
      <div className="lg:hidden">
        <ActivityLogCard
          activities={activities}
          formatTimestamp={formatTimestamp}
          hasMoreActivities={hasMoreActivities}
          onViewFullLog={() => setIsFullLogOpen(true)}
        />
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block h-full">
        <ActivityLogSidebar
          activities={activities}
          formatTimestamp={formatTimestamp}
          onCollapsedChange={onCollapsedChange}
        />
      </div>

      {/* Mobile Full Log Panel */}
      <ActivityLogPanel
        activities={activities}
        formatTimestamp={formatTimestamp}
        isOpen={isFullLogOpen}
        onClose={() => setIsFullLogOpen(false)}
      />
    </>
  )
}

export default ActivityLog

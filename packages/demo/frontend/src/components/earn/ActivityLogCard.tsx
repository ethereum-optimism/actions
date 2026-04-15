import { useState } from 'react'
import { LogTabContent } from './LogTabContent'
import type { ActivityEntry } from '../../providers/ActivityLogProvider'

type CardTab = 'log' | 'activity'

const TABS: { key: CardTab; label: string }[] = [
  { key: 'log', label: 'Log' },
  { key: 'activity', label: 'Activity' },
]

function TabButton({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '14px 20px',
        border: 'none',
        backgroundColor: 'transparent',
        fontSize: '15px',
        fontWeight: isActive ? 600 : 400,
        color: isActive ? '#1a1b1e' : '#9195A6',
        cursor: 'pointer',
        borderBottom: isActive ? '3px solid #1a1b1e' : '3px solid transparent',
        fontFamily: 'Inter',
      }}
    >
      {label}
    </button>
  )
}

interface ActivityLogCardProps {
  activities: ActivityEntry[]
  formatTimestamp: (timestamp: string) => string
  hasMoreActivities: boolean
  onViewFullLog: () => void
}

function ActivityLogCard({
  activities,
  formatTimestamp,
  hasMoreActivities,
  onViewFullLog,
}: ActivityLogCardProps) {
  const [activeTab, setActiveTab] = useState<CardTab>('log')
  const displayedActivities = activities.slice(0, 3)

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E0E2EB',
        borderRadius: '24px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ padding: '0 24px' }}>
        <div className="flex" style={{ gap: 0 }}>
          {TABS.map((tab) => (
            <TabButton
              key={tab.key}
              label={tab.label}
              isActive={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            />
          ))}
        </div>
        <div style={{ borderBottom: '1px solid #E0E2EB' }} />
      </div>

      <div
        className="overflow-y-auto max-h-96"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#D1D5DB #F3F4F6',
        }}
      >
        <LogTabContent
          activeTab={activeTab}
          activities={activities}
          displayActivities={displayedActivities}
          formatTimestamp={formatTimestamp}
        />
      </div>

      {activeTab === 'log' && hasMoreActivities && (
        <div className="p-4 pt-0">
          <button
            onClick={onViewFullLog}
            className="w-full py-3 text-center font-medium transition-colors"
            style={{
              color: '#1a1b1e',
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            View Full Log
          </button>
        </div>
      )}
    </div>
  )
}

export default ActivityLogCard

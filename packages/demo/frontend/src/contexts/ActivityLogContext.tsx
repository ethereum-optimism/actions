import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

export type ActivityEntry = {
  id: number
  type: 'lend' | 'withdraw' | 'fund' | 'wallet' | 'markets'
  action: string
  amount?: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'error'
}

type ActivityLogContextType = {
  activities: ActivityEntry[]
  addActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => number
  updateActivity: (id: number, updates: Partial<ActivityEntry>) => void
  clearActivities: () => void
  addOrUpdateActivity: (key: string, entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => number
}

const ActivityLogContext = createContext<ActivityLogContextType | undefined>(undefined)

export function ActivityLogProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<ActivityEntry[]>([])
  const [nextId, setNextId] = useState(1)
  const [activityKeys, setActivityKeys] = useState<Map<string, number>>(new Map())

  const addActivity = useCallback((entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => {
    const id = nextId
    const newActivity: ActivityEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    }

    setActivities(prev => [newActivity, ...prev])
    setNextId(prev => prev + 1)

    return id
  }, [nextId])

  const addOrUpdateActivity = useCallback((key: string, entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => {
    const existingId = activityKeys.get(key)

    if (existingId !== undefined) {
      // Update existing activity
      setActivities(prev =>
        prev.map(activity =>
          activity.id === existingId
            ? { ...activity, ...entry, timestamp: new Date().toISOString() }
            : activity
        )
      )
      return existingId
    } else {
      // Create new activity
      const id = nextId
      const newActivity: ActivityEntry = {
        ...entry,
        id,
        timestamp: new Date().toISOString(),
      }

      setActivities(prev => [newActivity, ...prev])
      setNextId(prev => prev + 1)
      setActivityKeys(prev => new Map(prev).set(key, id))

      return id
    }
  }, [nextId, activityKeys])

  const updateActivity = useCallback((id: number, updates: Partial<ActivityEntry>) => {
    setActivities(prev =>
      prev.map(activity =>
        activity.id === id
          ? { ...activity, ...updates }
          : activity
      )
    )
  }, [])

  const clearActivities = useCallback(() => {
    setActivities([])
    setNextId(1)
    setActivityKeys(new Map())
  }, [])

  return (
    <ActivityLogContext.Provider
      value={{ activities, addActivity, updateActivity, clearActivities, addOrUpdateActivity }}
    >
      {children}
    </ActivityLogContext.Provider>
  )
}

export function useActivityLog() {
  const context = useContext(ActivityLogContext)
  if (!context) {
    throw new Error('useActivityLog must be used within ActivityLogProvider')
  }
  return context
}

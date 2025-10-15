import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from 'react'

export type ActivityEntry = {
  id: number
  type: 'lend' | 'withdraw' | 'fund' | 'wallet'
  action: string
  amount?: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'error'
  request?: Record<string, unknown>
  response?: Record<string, unknown>
  blockExplorerUrl?: string
  isTransaction?: boolean
  isFromPreviousSession?: boolean
}

type ActivityLogContextType = {
  activities: ActivityEntry[]
  addActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => number
  updateActivity: (id: number, updates: Partial<ActivityEntry>) => void
  clearActivities: () => void
  addOrUpdateActivity: (
    key: string,
    entry: Omit<ActivityEntry, 'id' | 'timestamp'>,
  ) => number
}

const ActivityLogContext = createContext<ActivityLogContextType | undefined>(
  undefined,
)

const STORAGE_KEY = 'activity-log'
const NEXT_ID_KEY = 'activity-log-next-id'

export function ActivityLogProvider({ children }: { children: ReactNode }) {
  const [activities, setActivities] = useState<ActivityEntry[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as ActivityEntry[]
        // Mark all loaded activities as from previous session
        return parsed.map((activity) => ({
          ...activity,
          isFromPreviousSession: true,
        }))
      }
      return []
    } catch {
      return []
    }
  })
  const nextIdRef = useRef((() => {
    try {
      const stored = localStorage.getItem(NEXT_ID_KEY)
      return stored ? parseInt(stored, 10) : 1
    } catch {
      return 1
    }
  })())
  const activityKeysRef = useRef<Map<string, number>>(new Map())

  // Sync transaction activities to localStorage whenever they change
  useEffect(() => {
    try {
      const transactionActivities = activities.filter(
        (activity) => activity.isTransaction,
      )
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactionActivities))
      localStorage.setItem(NEXT_ID_KEY, nextIdRef.current.toString())
    } catch {
      // Ignore errors
    }
  }, [activities])

  const addActivity = useCallback(
    (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => {
      const newId = nextIdRef.current
      nextIdRef.current += 1

      const newActivity: ActivityEntry = {
        ...entry,
        id: newId,
        timestamp: new Date().toISOString(),
      }

      setActivities((prev) => [newActivity, ...prev])

      return newId
    },
    [],
  )

  const addOrUpdateActivity = useCallback(
    (key: string, entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => {
      const existingId = activityKeysRef.current.get(key)

      if (existingId !== undefined) {
        // Update existing activity
        setActivities((prev) =>
          prev.map((activity) =>
            activity.id === existingId
              ? { ...activity, ...entry, timestamp: new Date().toISOString() }
              : activity,
          ),
        )
        return existingId
      } else {
        // Create new activity
        const newId = nextIdRef.current
        nextIdRef.current += 1

        const newActivity: ActivityEntry = {
          ...entry,
          id: newId,
          timestamp: new Date().toISOString(),
        }

        setActivities((prev) => [newActivity, ...prev])
        activityKeysRef.current.set(key, newId)

        return newId
      }
    },
    [],
  )

  const updateActivity = useCallback(
    (id: number, updates: Partial<ActivityEntry>) => {
      setActivities((prev) =>
        prev.map((activity) =>
          activity.id === id ? { ...activity, ...updates } : activity,
        ),
      )
    },
    [],
  )

  const clearActivities = useCallback(() => {
    setActivities([])
    nextIdRef.current = 1
    activityKeysRef.current = new Map()
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(NEXT_ID_KEY)
    } catch {
      // Ignore errors
    }
  }, [])

  return (
    <ActivityLogContext.Provider
      value={{
        activities,
        addActivity,
        updateActivity,
        clearActivities,
        addOrUpdateActivity,
      }}
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

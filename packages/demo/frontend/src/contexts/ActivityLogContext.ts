import { createContext } from 'react'
import type { ActivityEntry } from '../providers/ActivityLogProvider'

export type ActivityLogContextType = {
  activities: ActivityEntry[]
  addActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => number
  updateActivity: (id: number, updates: Partial<ActivityEntry>) => void
  clearActivities: () => void
  addOrUpdateActivity: (
    key: string,
    entry: Omit<ActivityEntry, 'id' | 'timestamp'>,
  ) => number
}

export const ActivityLogContext = createContext<
  ActivityLogContextType | undefined
>(undefined)

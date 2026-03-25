import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react'

import { ActivityLogContext } from '../contexts/ActivityLogContext'
import { ACTIVITY_CONFIG } from '../constants/activityLogConfigs'

export interface ActivityMetadata {
  amount?: string
  assetSymbol?: string
  assetLogo?: string
  marketName?: string
  marketLogo?: string
  chainId?: number
  // Swap-specific
  amountOut?: string
  assetOutSymbol?: string
  assetOutLogo?: string
}

export type ActivityEntry = {
  id: number
  type: 'lend' | 'withdraw' | 'fund' | 'wallet' | 'swap'
  action: string
  timestamp: string
  status: 'pending' | 'confirmed' | 'error'
  blockExplorerUrl?: string
  isFromPreviousSession?: boolean
  metadata?: ActivityMetadata
}

/** Returns true if the action represents an on-chain transaction (not a read-only query) */
function isTransactionAction(action: string): boolean {
  const config = ACTIVITY_CONFIG[action]
  return !!config && !config.isReadOnly
}

export function ActivityLogProvider({
  children,
  walletProvider,
  walletAddress,
}: {
  children: ReactNode
  walletProvider?: string
  walletAddress?: string | null
}) {
  // Stable key using wallet address when available, provider as fallback
  const keyBase = walletAddress
    ? `activity-log-${walletAddress}`
    : walletProvider
      ? `activity-log-${walletProvider}`
      : 'activity-log'
  const STORAGE_KEY = keyBase
  const NEXT_ID_KEY = `${keyBase}-next-id`

  const [activities, setActivities] = useState<ActivityEntry[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as ActivityEntry[]
        return parsed.map((a) => ({ ...a, isFromPreviousSession: true }))
      }
      return []
    } catch {
      return []
    }
  })
  const nextIdRef = useRef(
    (() => {
      try {
        const stored = localStorage.getItem(NEXT_ID_KEY)
        return stored ? parseInt(stored, 10) : 1
      } catch {
        return 1
      }
    })(),
  )
  const activityKeysRef = useRef<Map<string, number>>(new Map())
  const prevKeyRef = useRef(STORAGE_KEY)

  // When wallet address changes (login/logout), reload from the new key
  useEffect(() => {
    if (STORAGE_KEY === prevKeyRef.current) return
    prevKeyRef.current = STORAGE_KEY
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as ActivityEntry[]
        setActivities(
          parsed.map((a) => ({ ...a, isFromPreviousSession: true })),
        )
      } else {
        setActivities([])
      }
      const storedId = localStorage.getItem(NEXT_ID_KEY)
      nextIdRef.current = storedId ? parseInt(storedId, 10) : 1
      activityKeysRef.current = new Map()
    } catch {
      setActivities([])
    }
  }, [STORAGE_KEY, NEXT_ID_KEY])

  // Sync to localStorage on every change
  useEffect(() => {
    try {
      const transactionActivities = activities.filter(
        (activity) =>
          activity.status === 'confirmed' &&
          isTransactionAction(activity.action),
      )
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactionActivities))
      localStorage.setItem(NEXT_ID_KEY, nextIdRef.current.toString())
    } catch {
      // Ignore errors
    }
  }, [activities, STORAGE_KEY, NEXT_ID_KEY])

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
  }, [STORAGE_KEY, NEXT_ID_KEY])

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

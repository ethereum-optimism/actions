import { useMemo, useRef, useEffect } from 'react'
import { actionsApi } from '../api/actionsApi'
import { useActivityLog } from '../contexts/ActivityLogContext'
import { ACTIVITY_CONFIG } from '../components/ActivityLogItem'

const activeCallsMap = new Map<string, number>()

export function useLoggedActionsApi() {
  const { addActivity, updateActivity } = useActivityLog()

  // Store callbacks in refs to avoid recreating the proxy
  const addActivityRef = useRef(addActivity)
  const updateActivityRef = useRef(updateActivity)

  // Update refs when callbacks change
  useEffect(() => {
    addActivityRef.current = addActivity
    updateActivityRef.current = updateActivity
  }, [addActivity, updateActivity])

  return useMemo(() => {
    return new Proxy(actionsApi, {
      get(target, prop: string) {
        const original = target[prop as keyof typeof target]

        // Not a function, return as-is
        if (typeof original !== 'function') return original

        // Not in activity config, pass through without logging
        const config = ACTIVITY_CONFIG[prop as keyof typeof ACTIVITY_CONFIG]
        if (!config) {
          return original.bind(target)
        }

        // Wrap with logging
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return async (...args: any[]) => {
          const amount = config.getAmount
            ? config.getAmount(...args)
            : undefined

          // For read-only operations, always create a new entry (no retry logic)
          if (config.isReadOnly) {
            const id = addActivityRef.current({
              type: config.type,
              action: config.action,
              amount,
              status: 'pending',
            })

            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
              const result = await (original as Function).apply(target, args)
              updateActivityRef.current(id, { status: 'confirmed' })
              return result
            } catch (error) {
              updateActivityRef.current(id, { status: 'error' })
              throw error
            }
          }

          // For write operations, use retry logic
          // Create a unique key for this call based on method and first arg (usually userId)
          const callKey = `${prop}:${args[0] || 'default'}`

          // Check if there's already an active call for this key
          let id = activeCallsMap.get(callKey)

          if (id === undefined) {
            // First call - create new activity
            id = addActivityRef.current({
              type: config.type,
              action: config.action,
              amount,
              status: 'pending',
            })
            activeCallsMap.set(callKey, id)
          } else {
            // Retry - update existing activity to pending
            updateActivityRef.current(id, {
              status: 'pending',
            })
          }

          try {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            const result = await (original as Function).apply(target, args)

            // Update with actual amount from result if available
            const finalAmount = result?.amount || amount
            updateActivityRef.current(id, {
              status: 'confirmed',
              amount: finalAmount,
            })

            // Clear the active call since it succeeded
            activeCallsMap.delete(callKey)

            return result
          } catch (error) {
            updateActivityRef.current(id, { status: 'error' })
            // Don't clear the active call on error - next retry will reuse the same entry
            throw error
          }
        }
      },
    }) as typeof actionsApi
  }, [])
}

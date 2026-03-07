import { useCallback, useRef } from 'react'
import { useActivityLog } from './useActivityLog'
import { ACTIVITY_CONFIG } from '../constants/activityLogConfigs'
import type { ActivityMetadata } from '@/providers/ActivityLogProvider'

export interface ActivityLogHandle {
  id: number
  confirm: (data?: {
    blockExplorerUrl?: string
    metadata?: ActivityMetadata
  }) => void
  error: () => void
}

/**
 * Hook for manually logging activities to the activity log.
 *
 * @example
 * ```tsx
 * const { logActivity } = useActivityLogger()
 *
 * const handleMint = async () => {
 *   const activity = logActivity('mint')
 *
 *   try {
 *     const result = await actionsApi.fundWallet(userId, headers)
 *     activity?.confirm({
 *       blockExplorerUrl: result.blockExplorerUrls?.[0]
 *     })
 *   } catch (error) {
 *     activity?.error()
 *     throw error
 *   }
 * }
 * ```
 */
export function useActivityLogger() {
  const { addActivity, updateActivity } = useActivityLog()
  const lastActionRef = useRef<{ action: string; id: number } | null>(null)

  /**
   * Logs an activity by its action key.
   * Consecutive read-only actions of the same type reuse the existing log entry.
   * A different action in between resets the dedup, creating a new entry.
   */
  const logActivity = useCallback(
    (action: string, metadata?: ActivityMetadata): ActivityLogHandle | null => {
      const config = ACTIVITY_CONFIG[action]
      if (!config) {
        console.warn(`No activity config found for action: ${action}`)
        return null
      }

      const entry = {
        type: config.type,
        action,
        status: 'pending' as const,
        metadata,
      }

      // Reuse the existing row only if it's the same read-only action consecutively
      const canReuse =
        config.isReadOnly && lastActionRef.current?.action === action

      let id: number
      if (canReuse) {
        id = lastActionRef.current!.id
        updateActivity(id, { ...entry, timestamp: new Date().toISOString() })
      } else {
        id = addActivity(entry)
      }
      lastActionRef.current = { action, id }

      return {
        id,
        confirm: (data) => {
          updateActivity(id, {
            status: 'confirmed',
            blockExplorerUrl: data?.blockExplorerUrl,
            ...(data?.metadata && { metadata: data.metadata }),
          })
        },
        error: () => {
          updateActivity(id, { status: 'error' })
        },
      }
    },
    [addActivity, updateActivity],
  )

  return { logActivity }
}

import { useCallback } from 'react'
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
  const { addActivity, updateActivity, addOrUpdateActivity } = useActivityLog()

  /**
   * Logs an activity by its action key.
   * Read-only actions (e.g. getPrice, getMarket) reuse the same log entry
   * on consecutive calls instead of creating duplicates.
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

      // Read-only actions reuse the same log row; mutations always get a new row
      const id = config.isReadOnly
        ? addOrUpdateActivity(action, entry)
        : addActivity(entry)

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
    [addActivity, updateActivity, addOrUpdateActivity],
  )

  return { logActivity }
}

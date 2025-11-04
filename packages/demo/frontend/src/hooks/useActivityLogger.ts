import { useCallback } from 'react'
import { useActivityLog } from './useActivityLog'
import { ACTIVITY_CONFIG } from '../constants/activityLogConfigs'

export interface ActivityLogHandle {
  id: number
  confirm: (data?: { blockExplorerUrl?: string }) => void
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

  /**
   * Logs an activity by its action key
   *
   * @param action - The action key from ACTIVITY_CONFIG (e.g., 'mint', 'getBalance')
   * @returns An activity handle with confirm() and error() methods, or null if config not found
   */
  const logActivity = useCallback(
    (action: string): ActivityLogHandle | null => {
      const config = ACTIVITY_CONFIG[action]
      if (!config) {
        console.warn(`No activity config found for action: ${action}`)
        return null
      }

      const id = addActivity({
        type: config.type,
        action: action,
        status: 'pending',
      })

      return {
        id,
        confirm: (data) => {
          updateActivity(id, {
            status: 'confirmed',
            blockExplorerUrl: data?.blockExplorerUrl,
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

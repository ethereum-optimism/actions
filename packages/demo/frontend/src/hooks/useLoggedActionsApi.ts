import { useMemo } from 'react'
import { actionsApi } from '../api/actionsApi'
import { useActivityLog } from '../contexts/ActivityLogContext'

type LogConfig = {
  type: 'lend' | 'withdraw' | 'fund' | 'wallet'
  action: string
  getAmount?: (...args: any[]) => string
}

const LOG_CONFIG: Record<string, LogConfig> = {
  createWallet: {
    type: 'wallet',
    action: 'create',
  },
  fundWallet: {
    type: 'fund',
    action: 'mint',
    getAmount: () => '100.00',
  },
  openLendPosition: {
    type: 'lend',
    action: 'deposit',
    getAmount: (_walletId: string, amount: number) => amount.toString(),
  },
  closeLendPosition: {
    type: 'withdraw',
    action: 'withdraw',
    getAmount: (_walletId: string, amount: number) => amount.toString(),
  },
  sendTokens: {
    type: 'wallet',
    action: 'send',
    getAmount: (_walletId: string, amount: number) => amount.toString(),
  },
}

const activeCallsMap = new Map<string, number>()

export function useLoggedActionsApi() {
  const { addActivity, updateActivity } = useActivityLog()

  return useMemo(() => {
    return new Proxy(actionsApi, {
      get(target, prop: string) {
        const original = target[prop as keyof typeof target]

        // Not a function, return as-is
        if (typeof original !== 'function') return original

        // Not in log config, pass through without logging
        const config = LOG_CONFIG[prop]
        if (!config) {
          return original.bind(target)
        }

        // Wrap with logging
        return async (...args: any[]) => {
          const amount = config.getAmount ? config.getAmount(...args) : undefined

          // Create a unique key for this call based on method and first arg (usually userId)
          const callKey = `${prop}:${args[0] || 'default'}`

          // Check if there's already an active call for this key
          let id = activeCallsMap.get(callKey)

          if (id === undefined) {
            // First call - create new activity
            id = addActivity({
              type: config.type,
              action: config.action,
              amount,
              status: 'pending',
            })
            activeCallsMap.set(callKey, id)
          } else {
            // Retry - update existing activity to pending
            updateActivity(id, {
              status: 'pending',
            })
          }

          try {
            const result = await (original as Function).apply(target, args)

            // Update with actual amount from result if available
            const finalAmount = result?.amount || amount
            updateActivity(id, {
              status: 'confirmed',
              amount: finalAmount,
            })

            // Clear the active call since it succeeded
            activeCallsMap.delete(callKey)

            return result
          } catch (error) {
            updateActivity(id, { status: 'error' })
            // Don't clear the active call on error - next retry will reuse the same entry
            throw error
          }
        }
      },
    }) as typeof actionsApi
  }, [addActivity, updateActivity])
}

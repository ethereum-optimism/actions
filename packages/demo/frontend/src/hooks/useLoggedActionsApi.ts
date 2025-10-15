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

          // Console log the function call
          console.log(`[${config.apiMethod}]`)

          // For read-only operations, always create a new entry (no retry logic)
          if (config.isReadOnly) {
            const id = addActivityRef.current({
              type: config.type,
              action: config.action,
              amount,
              status: 'pending',
              isTransaction: false,
            })

            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
              const result = await (original as Function).apply(target, args)

              // Map params based on the method
              let sdkParams
              if (prop === 'getPosition') {
                // getPosition(marketId, walletId) -> wallet.lend.getPosition({ marketId })
                sdkParams = { marketId: args[0] }
              } else if (prop === 'getMarkets') {
                // getMarkets() -> actions.lend.getMarkets()
                sdkParams = undefined
              } else if (prop === 'getWalletBalance') {
                // getWalletBalance(userId) -> wallet.getBalance()
                sdkParams = undefined
              }

              updateActivityRef.current(id, {
                status: 'confirmed',
                response: result,
                request: sdkParams,
              })
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
              isTransaction: true,
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

            // Extract blockExplorerUrl from transaction response
            let blockExplorerUrl: string | undefined
            if (result?.transaction?.blockExplorerUrls) {
              blockExplorerUrl = result.transaction.blockExplorerUrls[0]
            } else if (result?.blockExplorerUrls) {
              blockExplorerUrl = result.blockExplorerUrls[0]
            }

            // Map backend params to SDK function signatures
            let sdkParams: Record<string, unknown> | undefined
            let sdkResponse: Record<string, unknown> | undefined

            switch (prop) {
              case 'openLendPosition':
              case 'closeLendPosition':
                // Backend params: (walletId, amount, tokenAddress, marketId)
                // SDK signature: wallet.lend.openPosition({ amount, asset, marketId })
                sdkParams = {
                  amount: args[1],
                  asset: {
                    address: { [args[3]?.chainId]: args[2] },
                    metadata: { symbol: 'USDC' }, // TODO: get from result
                  },
                  marketId: args[3],
                }
                // Backend returns: { transaction: { transactionHashes, userOpHash, blockExplorerUrls, amount, tokenAddress, marketId } }
                // SDK returns: { transactionHash, userOpHash, ... } (LendTransactionReceipt)
                sdkResponse = result?.transaction
                  ? {
                      transactionHash:
                        result.transaction.transactionHashes?.[0],
                      userOpHash: result.transaction.userOpHash,
                    }
                  : undefined
                break

              case 'fundWallet':
                // Backend params: (userId)
                // SDK signature: wallet.fund()
                sdkParams = undefined
                // Backend returns: { success, to, amount, transactionHashes, userOpHash, blockExplorerUrls }
                sdkResponse = {
                  transactionHash: result?.transactionHashes?.[0],
                  userOpHash: result?.userOpHash,
                }
                break

              default:
                sdkParams = undefined
                sdkResponse = undefined
            }

            updateActivityRef.current(id, {
              status: 'confirmed',
              amount: finalAmount,
              response: sdkResponse || result,
              request: sdkParams,
              blockExplorerUrl,
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

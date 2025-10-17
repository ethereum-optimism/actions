import { useState, useEffect } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import type { SmartWallet } from '@eth-optimism/actions-sdk/react'
import { useActions } from './useActions'

/**
 * Hook that automatically creates and returns a smart wallet from Dynamic
 * Returns null when wallet is not ready, otherwise returns the SmartWallet instance
 */
export function useDynamicWallet() {
  const { primaryWallet } = useDynamicContext()
  const { actions } = useActions()
  const [smartWallet, setSmartWallet] = useState<SmartWallet | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const createSmartWallet = async () => {
      if (!primaryWallet) {
        setSmartWallet(null)
        setError(null)
        return
      }

      if (isCreating || smartWallet) {
        return
      }

      try {
        setIsCreating(true)
        setError(null)

        const signer = await actions.wallet.createSigner({
          wallet: primaryWallet,
        })
        const result = await actions.wallet.createSmartWallet({
          signer: signer,
        })

        setSmartWallet(result.wallet)
      } catch (err) {
        setError(
          err instanceof Error ? err : new Error('Failed to create wallet'),
        )
        setSmartWallet(null)
      } finally {
        setIsCreating(false)
      }
    }

    createSmartWallet()
  }, [primaryWallet, actions, isCreating, smartWallet])

  return {
    smartWallet,
    isCreating,
    error,
  }
}

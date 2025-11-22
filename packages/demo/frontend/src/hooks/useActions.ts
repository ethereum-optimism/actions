import { useMemo } from 'react'
import {
  createActions,
  type ReactProviderTypes,
} from '@eth-optimism/actions-sdk/react'
import { createActionsConfig } from '@/config/actions'

export function useActions<T extends ReactProviderTypes>({
  hostedWalletProviderType,
}: {
  hostedWalletProviderType: T
}) {
  // Memoize the config to prevent recreating it on every render
  const config = useMemo(
    () => createActionsConfig(hostedWalletProviderType),
    [hostedWalletProviderType],
  )

  // Memoize the actions instance to prevent recreating on every render
  const actions = useMemo(() => createActions(config), [config])

  return { actions }
}

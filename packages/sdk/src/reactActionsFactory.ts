import { Actions } from '@/actions.js'
import type { ActionsConfig } from '@/types/actions.js'
import type {
  ReactHostedWalletProvidersSchema,
  ReactOptionsMap,
  ReactProviderTypes,
} from '@/wallet/react/providers/hosted/types/index.js'
import { ReactHostedWalletProviderRegistry } from '@/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.js'

/**
 * React Actions configuration
 * @description Configuration object for initializing the Actions SDK in React
 */
export type ReactActionsConfig<
  HostedWalletProviderType extends ReactProviderTypes,
> = ActionsConfig<HostedWalletProviderType, ReactOptionsMap>

/**
 * Creates a React/browser environment Actions factory
 *
 * Creates an Actions instance wired with the React-specific HostedWalletProviderRegistry.
 * This registry enables browser-only hosted providers and defers
 * their imports to the client environment to keep server builds clean.
 * @param config Actions configuration
 * @returns Actions instance using the ReactHostedWalletProviderRegistry
 */
export function createActions<
  HostedWalletProviderType extends ReactProviderTypes,
>(config: ReactActionsConfig<HostedWalletProviderType>) {
  return new Actions<
    ReactHostedWalletProvidersSchema['providerTypes'],
    ReactHostedWalletProvidersSchema,
    HostedWalletProviderType
  >(config, {
    hostedWalletProviderRegistry: new ReactHostedWalletProviderRegistry(),
  })
}

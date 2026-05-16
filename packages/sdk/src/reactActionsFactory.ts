import { Actions } from '@/actions.js'
import type { ActionsConfig } from '@/types/actions.js'
import type {
  ReactEmbeddedWalletProvidersSchema,
  ReactOptionsMap,
  ReactProviderTypes,
} from '@/wallet/react/providers/embedded/types/index.js'
import { ReactEmbeddedWalletProviderRegistry } from '@/wallet/react/providers/registry/ReactEmbeddedWalletProviderRegistry.js'

/**
 * React Actions configuration
 * @description Configuration object for initializing the Actions SDK in React
 */
export type ReactActionsConfig<
  EmbeddedWalletProviderType extends ReactProviderTypes,
> = ActionsConfig<EmbeddedWalletProviderType, ReactOptionsMap>

/**
 * Creates a React/browser environment Actions factory
 *
 * Creates an Actions instance wired with the React-specific EmbeddedWalletProviderRegistry.
 * This registry enables browser-only hosted providers and defers
 * their imports to the client environment to keep server builds clean.
 * @param config Actions configuration
 * @returns Actions instance using the ReactEmbeddedWalletProviderRegistry
 */
export function createActions<
  EmbeddedWalletProviderType extends ReactProviderTypes,
>(config: ReactActionsConfig<EmbeddedWalletProviderType>) {
  return new Actions<
    ReactEmbeddedWalletProvidersSchema['providerTypes'],
    ReactEmbeddedWalletProvidersSchema,
    EmbeddedWalletProviderType
  >(config, {
    embeddedWalletProviderRegistry: new ReactEmbeddedWalletProviderRegistry(),
  })
}

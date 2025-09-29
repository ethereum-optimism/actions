import type { VerbsConfig } from '@/types/verbs.js'
import { Verbs } from '@/verbs.js'
import type {
  ReactHostedWalletProvidersSchema,
  ReactOptionsMap,
  ReactProviderTypes,
} from '@/wallet/react/providers/hosted/types/index.js'
import { ReactHostedWalletProviderRegistry } from '@/wallet/react/providers/registry/ReactHostedWalletProviderRegistry.js'

/**
 * React Verbs configuration
 * @description Configuration object for initializing the Verbs SDK in React
 */
export type ReactVerbsConfig<
  HostedWalletProviderType extends ReactProviderTypes,
> = VerbsConfig<HostedWalletProviderType, ReactOptionsMap>

/**
 * Creates a React/browser environment Verbs factory
 *
 * Creates a Verbs instance wired with the React-specific HostedWalletProviderRegistry.
 * This registry enables browser-only hosted providers and defers
 * their imports to the client environment to keep server builds clean.
 * @param config Verbs configuration
 * @returns Verbs instance using the ReactHostedWalletProviderRegistry
 */
export function createVerbs<
  HostedWalletProviderType extends ReactProviderTypes,
>(config: ReactVerbsConfig<HostedWalletProviderType>) {
  return new Verbs<
    ReactHostedWalletProvidersSchema['providerTypes'],
    ReactHostedWalletProvidersSchema,
    HostedWalletProviderType
  >(config, {
    hostedWalletProviderRegistry: new ReactHostedWalletProviderRegistry(),
  })
}

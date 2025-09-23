import type { VerbsConfig } from '@/types/verbs.js'
import { Verbs } from '@/verbs.js'
import { ReactHostedWalletProviderRegistry } from '@/wallet/providers/ReactHostedWalletProviderRegistry.js'

/**
 * Creates a React/browser environment Verbs factory
 *
 * Creates a Verbs instance wired with the React-specific HostedWalletProviderRegistry.
 * This registry enables browser-only hosted providers and defers
 * their imports to the client environment to keep server builds clean.
 * @param config Verbs configuration
 * @returns Verbs instance using the ReactHostedWalletProviderRegistry
 */
export function createVerbs(config: VerbsConfig<'dynamic'>) {
  return new Verbs(config, {
    hostedWalletProviderRegistry: new ReactHostedWalletProviderRegistry(),
  })
}

import type { VerbsConfig } from '@/types/verbs.js'
import { Verbs } from '@/verbs.js'
import { NodeHostedWalletProviderRegistry } from '@/wallet/providers/NodeHostedWalletProviderRegistry.js'

/**
 * Creates a Node environment Verbs factory
 *
 * Creates a Verbs instance wired with the Node-specific HostedWalletProviderRegistry.
 * This ensures browser-only providers  are never imported in Node,
 * avoiding runtime/module-resolution issues on the backend.
 * @param config Verbs configuration
 * @returns Verbs instance using the NodeHostedWalletProviderRegistry
 */
export function createVerbs(config: VerbsConfig<'privy'>) {
  return new Verbs(config, {
    hostedWalletProviderRegistry: new NodeHostedWalletProviderRegistry(),
  })
}

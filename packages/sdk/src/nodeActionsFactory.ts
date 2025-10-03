import { Verbs } from '@/actions.js'
import type { VerbsConfig } from '@/types/actions.js'
import { NodeHostedWalletProviderRegistry } from '@/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.js'
import type {
  NodeHostedWalletProvidersSchema,
  NodeOptionsMap,
  NodeProviderTypes,
} from '@/wallet/node/providers/hosted/types/index.js'

/**
 * Node Verbs configuration
 * @description Configuration object for initializing the Verbs SDK in Node
 */
export type NodeVerbsConfig<
  HostedWalletProviderType extends NodeProviderTypes,
> = VerbsConfig<HostedWalletProviderType, NodeOptionsMap>

/**
 * Creates a Node environment Verbs factory
 *
 * Creates a Verbs instance wired with the Node-specific HostedWalletProviderRegistry.
 * This ensures browser-only providers  are never imported in Node,
 * avoiding runtime/module-resolution issues on the backend.
 * @param config Verbs configuration
 * @returns Verbs instance using the NodeHostedWalletProviderRegistry
 */
export function createVerbs<HostedWalletProviderType extends NodeProviderTypes>(
  config: NodeVerbsConfig<HostedWalletProviderType>,
) {
  return new Verbs<
    NodeHostedWalletProvidersSchema['providerTypes'],
    NodeHostedWalletProvidersSchema,
    HostedWalletProviderType
  >(config, {
    hostedWalletProviderRegistry: new NodeHostedWalletProviderRegistry(),
  })
}

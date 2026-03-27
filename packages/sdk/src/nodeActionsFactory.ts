import { Actions } from '@/actions.js'
import type { ActionsConfig } from '@/types/actions.js'
import { NodeEmbeddedWalletProviderRegistry } from '@/wallet/node/providers/embedded/registry/NodeEmbeddedWalletProviderRegistry.js'
import type {
  NodeEmbeddedWalletProvidersSchema,
  NodeOptionsMap,
  NodeProviderTypes,
} from '@/wallet/node/providers/embedded/types/index.js'

/**
 * Node Actions configuration
 * @description Configuration object for initializing the Actions SDK in Node
 */
export type NodeActionsConfig<
  EmbeddedWalletProviderType extends NodeProviderTypes,
> = ActionsConfig<EmbeddedWalletProviderType, NodeOptionsMap>

/**
 * Creates a Node environment Actions factory
 *
 * Creates an Actions instance wired with the Node-specific EmbeddedWalletProviderRegistry.
 * This ensures browser-only providers  are never imported in Node,
 * avoiding runtime/module-resolution issues on the backend.
 * @param config Actions configuration
 * @returns Actions instance using the NodeEmbeddedWalletProviderRegistry
 */
export function createActions<
  EmbeddedWalletProviderType extends NodeProviderTypes,
>(config: NodeActionsConfig<EmbeddedWalletProviderType>) {
  return new Actions<
    NodeEmbeddedWalletProvidersSchema['providerTypes'],
    NodeEmbeddedWalletProvidersSchema,
    EmbeddedWalletProviderType
  >(config, {
    embeddedWalletProviderRegistry: new NodeEmbeddedWalletProviderRegistry(),
  })
}

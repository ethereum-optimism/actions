import { Actions } from '@/actions.js'
import type { ActionsConfig } from '@/types/actions.js'
import { NodeHostedWalletProviderRegistry } from '@/wallet/node/providers/hosted/registry/NodeHostedWalletProviderRegistry.js'
import type {
  NodeHostedWalletProvidersSchema,
  NodeOptionsMap,
  NodeProviderTypes,
} from '@/wallet/node/providers/hosted/types/index.js'

/**
 * Node Actions configuration
 * @description Configuration object for initializing the Actions SDK in Node
 */
export type NodeActionsConfig<
  HostedWalletProviderType extends NodeProviderTypes,
> = ActionsConfig<HostedWalletProviderType, NodeOptionsMap>

/**
 * Creates a Node environment Actions factory
 *
 * Creates an Actions instance wired with the Node-specific HostedWalletProviderRegistry.
 * This ensures browser-only providers  are never imported in Node,
 * avoiding runtime/module-resolution issues on the backend.
 * @param config Actions configuration
 * @returns Actions instance using the NodeHostedWalletProviderRegistry
 */
export function createActions<
  HostedWalletProviderType extends NodeProviderTypes,
>(config: NodeActionsConfig<HostedWalletProviderType>) {
  return new Actions<
    NodeHostedWalletProvidersSchema['providerTypes'],
    NodeHostedWalletProvidersSchema,
    HostedWalletProviderType
  >(config, {
    hostedWalletProviderRegistry: new NodeHostedWalletProviderRegistry(),
  })
}

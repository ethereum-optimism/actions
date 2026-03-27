import { EmbeddedWalletProviderRegistry } from '@/wallet/core/providers/embedded/registry/EmbeddedWalletProviderRegistry.js'
import { PrivyEmbeddedWalletProvider } from '@/wallet/node/providers/embedded/privy/PrivyEmbeddedWalletProvider.js'
import { TurnkeyEmbeddedWalletProvider } from '@/wallet/node/providers/embedded/turnkey/TurnkeyEmbeddedWalletProvider.js'
import type {
  NodeHostedProviderInstanceMap,
  NodeOptionsMap,
  NodeProviderTypes,
} from '@/wallet/node/providers/embedded/types/index.js'

/**
 * Node hosted wallet provider registry
 * @description
 * Environment-scoped registry that binds Node/server provider keys to their
 * factory implementations. This ensures browser-only hosted providers are
 * discoverable at runtime without importing Node-only code. The registry
 * pre-registers 'privy' and 'turnkey' providers and can be extended with
 * additional providers via `register`.
 */
export class NodeEmbeddedWalletProviderRegistry extends EmbeddedWalletProviderRegistry<
  NodeHostedProviderInstanceMap,
  NodeOptionsMap,
  NodeProviderTypes
> {
  public constructor() {
    super()
    this.register<'privy'>({
      type: 'privy',
      validateOptions(options): options is NodeOptionsMap['privy'] {
        return Boolean((options as NodeOptionsMap['privy'])?.privyClient)
      },
      create(
        { chainManager, lendProviders, swapProviders, supportedAssets },
        options,
      ) {
        return new PrivyEmbeddedWalletProvider({
          privyClient: options.privyClient,
          chainManager,
          lendProviders,
          swapProviders,
          supportedAssets,
          authorizationContext: options.authorizationContext,
        })
      },
    })

    this.register<'turnkey'>({
      type: 'turnkey',
      validateOptions(options): options is NodeOptionsMap['turnkey'] {
        const o = options as NodeOptionsMap['turnkey']
        return Boolean(o?.client)
      },
      create(
        { chainManager, lendProviders, swapProviders, supportedAssets },
        options,
      ) {
        return new TurnkeyEmbeddedWalletProvider(
          options.client,
          chainManager,
          lendProviders,
          swapProviders,
          supportedAssets,
        )
      },
    })
  }
}

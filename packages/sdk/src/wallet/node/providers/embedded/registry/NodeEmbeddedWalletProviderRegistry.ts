import { EmbeddedWalletProviderRegistry } from '@/wallet/core/providers/embedded/registry/EmbeddedWalletProviderRegistry.js'
import type {
  NodeHostedProviderInstanceMap,
  NodeOptionsMap,
  NodeProviderTypes,
} from '@/wallet/node/providers/embedded/types/index.js'

/**
 * Node embedded wallet provider registry
 * @description
 * Environment-scoped registry that binds Node/server provider keys to their
 * factory implementations. Provider code is loaded lazily via dynamic import()
 * so that unused wallet SDKs are not included in the bundle.
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
      async create(
        { chainManager, lendProviders, swapProviders, supportedAssets },
        options,
      ) {
        const { PrivyEmbeddedWalletProvider } =
          await import('@/wallet/node/providers/embedded/privy/PrivyEmbeddedWalletProvider.js')
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
      async create(
        { chainManager, lendProviders, swapProviders, supportedAssets },
        options,
      ) {
        const { TurnkeyEmbeddedWalletProvider } =
          await import('@/wallet/node/providers/embedded/turnkey/TurnkeyEmbeddedWalletProvider.js')
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

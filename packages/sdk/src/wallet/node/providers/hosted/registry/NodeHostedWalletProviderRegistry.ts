import { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import type {
  NodeHostedProviderInstanceMap,
  NodeOptionsMap,
  NodeProviderTypes,
} from '@/wallet/node/providers/hosted/types/index.js'

/**
 * Node hosted wallet provider registry
 * @description
 * Environment-scoped registry that binds Node/server provider keys to their
 * factory implementations. Provider code is loaded lazily via dynamic import()
 * so that unused wallet SDKs are not included in the bundle.
 */
export class NodeHostedWalletProviderRegistry extends HostedWalletProviderRegistry<
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
        const { PrivyHostedWalletProvider } =
          await import('@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js')
        return new PrivyHostedWalletProvider({
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
        const { TurnkeyHostedWalletProvider } =
          await import('@/wallet/node/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js')
        return new TurnkeyHostedWalletProvider(
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

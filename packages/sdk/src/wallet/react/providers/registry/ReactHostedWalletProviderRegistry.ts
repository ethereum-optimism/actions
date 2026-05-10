import { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import type {
  ReactHostedProviderInstanceMap,
  ReactOptionsMap,
  ReactProviderTypes,
} from '@/wallet/react/providers/hosted/types/index.js'

/**
 * React hosted wallet provider registry
 * @description
 * Environment-scoped registry that binds React/browser provider keys to their
 * factory implementations. Provider code is loaded lazily via dynamic import()
 * so that unused wallet SDKs are not included in the bundle.
 */
export class ReactHostedWalletProviderRegistry extends HostedWalletProviderRegistry<
  ReactHostedProviderInstanceMap,
  ReactOptionsMap,
  ReactProviderTypes
> {
  public constructor() {
    super()
    this.register<'dynamic'>({
      type: 'dynamic',
      validateOptions(_options): _options is ReactOptionsMap['dynamic'] {
        return true
      },
      async create(
        { chainManager, lendProviders, swapProviders, supportedAssets },
        _options,
      ) {
        const { DynamicHostedWalletProvider } =
          await import('@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js')
        return new DynamicHostedWalletProvider(
          chainManager,
          lendProviders,
          swapProviders,
          supportedAssets,
        )
      },
    })

    this.register<'privy'>({
      type: 'privy',
      validateOptions(_options): _options is ReactOptionsMap['privy'] {
        return true
      },
      async create(
        { chainManager, lendProviders, swapProviders, supportedAssets },
        _options,
      ) {
        const { PrivyHostedWalletProvider } =
          await import('@/wallet/react/providers/hosted/privy/PrivyHostedWalletProvider.js')
        return new PrivyHostedWalletProvider(
          chainManager,
          lendProviders,
          swapProviders,
          supportedAssets,
        )
      },
    })

    this.register<'turnkey'>({
      type: 'turnkey',
      validateOptions(_options): _options is ReactOptionsMap['turnkey'] {
        return true
      },
      async create(
        { chainManager, lendProviders, swapProviders, supportedAssets },
        _options,
      ) {
        const { TurnkeyHostedWalletProvider } =
          await import('@/wallet/react/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js')
        return new TurnkeyHostedWalletProvider(
          chainManager,
          lendProviders,
          swapProviders,
          supportedAssets,
        )
      },
    })
  }
}

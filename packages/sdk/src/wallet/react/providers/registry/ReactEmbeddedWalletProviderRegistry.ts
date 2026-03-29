import { EmbeddedWalletProviderRegistry } from '@/wallet/core/providers/embedded/registry/EmbeddedWalletProviderRegistry.js'
import type {
  ReactHostedProviderInstanceMap,
  ReactOptionsMap,
  ReactProviderTypes,
} from '@/wallet/react/providers/embedded/types/index.js'

/**
 * React embedded wallet provider registry
 * @description
 * Environment-scoped registry that binds React/browser provider keys to their
 * factory implementations. Provider code is loaded lazily via dynamic import()
 * so that unused wallet SDKs are not included in the bundle.
 */
export class ReactEmbeddedWalletProviderRegistry extends EmbeddedWalletProviderRegistry<
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
        const { DynamicEmbeddedWalletProvider } =
          await import('@/wallet/react/providers/embedded/dynamic/DynamicEmbeddedWalletProvider.js')
        return new DynamicEmbeddedWalletProvider(
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
        const { PrivyEmbeddedWalletProvider } =
          await import('@/wallet/react/providers/embedded/privy/PrivyEmbeddedWalletProvider.js')
        return new PrivyEmbeddedWalletProvider(
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
        const { TurnkeyEmbeddedWalletProvider } =
          await import('@/wallet/react/providers/embedded/turnkey/TurnkeyEmbeddedWalletProvider.js')
        return new TurnkeyEmbeddedWalletProvider(
          chainManager,
          lendProviders,
          swapProviders,
          supportedAssets,
        )
      },
    })
  }
}

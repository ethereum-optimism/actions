import { EmbeddedWalletProviderRegistry } from '@/wallet/core/providers/embedded/registry/EmbeddedWalletProviderRegistry.js'
import { DynamicEmbeddedWalletProvider } from '@/wallet/react/providers/embedded/dynamic/DynamicEmbeddedWalletProvider.js'
import { PrivyEmbeddedWalletProvider } from '@/wallet/react/providers/embedded/privy/PrivyEmbeddedWalletProvider.js'
import { TurnkeyEmbeddedWalletProvider } from '@/wallet/react/providers/embedded/turnkey/TurnkeyEmbeddedWalletProvider.js'
import type {
  ReactEmbeddedProviderInstanceMap,
  ReactOptionsMap,
  ReactProviderTypes,
} from '@/wallet/react/providers/embedded/types/index.js'

/**
 * React embedded wallet provider registry
 * @description
 * Environment-scoped registry that binds React/browser provider keys to their
 * factory implementations. This ensures browser-only embedded providers are
 * discoverable at runtime without importing Node-only code. The registry
 * pre-registers 'dynamic' and 'privy' providers and can be extended with
 * additional providers via `register`.
 */
export class ReactEmbeddedWalletProviderRegistry extends EmbeddedWalletProviderRegistry<
  ReactEmbeddedProviderInstanceMap,
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
      create({ chainManager, lendProviders, swapProviders }, _options) {
        return new DynamicEmbeddedWalletProvider(
          chainManager,
          lendProviders,
          swapProviders,
        )
      },
    })

    this.register<'privy'>({
      type: 'privy',
      validateOptions(_options): _options is ReactOptionsMap['privy'] {
        return true
      },
      create({ chainManager, lendProviders, swapProviders }, _options) {
        return new PrivyEmbeddedWalletProvider(
          chainManager,
          lendProviders,
          swapProviders,
        )
      },
    })

    this.register<'turnkey'>({
      type: 'turnkey',
      validateOptions(_options): _options is ReactOptionsMap['turnkey'] {
        return true
      },
      create({ chainManager, lendProviders, swapProviders }, _options) {
        return new TurnkeyEmbeddedWalletProvider(
          chainManager,
          lendProviders,
          swapProviders,
        )
      },
    })
  }
}

import { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import { DynamicHostedWalletProvider } from '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'
import { PrivyHostedWalletProvider } from '@/wallet/react/providers/hosted/privy/PrivyHostedWalletProvider.js'
import { TurnkeyHostedWalletProvider } from '@/wallet/react/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js'
import type {
  ReactHostedProviderInstanceMap,
  ReactOptionsMap,
  ReactProviderTypes,
} from '@/wallet/react/providers/hosted/types/index.js'

/**
 * React hosted wallet provider registry
 * @description
 * Environment-scoped registry that binds React/browser provider keys to their
 * factory implementations. This ensures browser-only hosted providers are
 * discoverable at runtime without importing Node-only code. The registry
 * pre-registers 'dynamic' and 'privy' providers and can be extended with
 * additional providers via `register`.
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
      create({ chainManager, lendProviders }, _options) {
        return new DynamicHostedWalletProvider(chainManager, lendProviders)
      },
    })

    this.register<'privy'>({
      type: 'privy',
      validateOptions(_options): _options is ReactOptionsMap['privy'] {
        return true
      },
      create({ chainManager, lendProviders }, _options) {
        return new PrivyHostedWalletProvider(chainManager, lendProviders)
      },
    })

    this.register<'turnkey'>({
      type: 'turnkey',
      validateOptions(_options): _options is ReactOptionsMap['turnkey'] {
        return true
      },
      create({ chainManager, lendProviders }, _options) {
        return new TurnkeyHostedWalletProvider(chainManager, lendProviders)
      },
    })
  }
}

import { HostedWalletProviderRegistry } from '@/wallet/providers/base/HostedWalletProviderRegistry.js'
import { DynamicHostedWalletProvider } from '@/wallet/providers/DynamicHostedWalletProvider.js'
import type { DynamicOptions } from '@/wallet/providers/hostedProvider.types.js'

/**
 * React/browser hosted wallet registry.
 * Registers browser-only providers for client apps.
 */
export class ReactHostedWalletProviderRegistry extends HostedWalletProviderRegistry {
  public constructor() {
    super()
    this.register<'dynamic'>({
      type: 'dynamic',
      validateOptions(_options): _options is DynamicOptions {
        return true
      },
      create({ chainManager }, _options) {
        return new DynamicHostedWalletProvider(chainManager)
      },
    })
  }
}

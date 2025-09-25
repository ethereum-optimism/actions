import { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import type { DynamicOptions } from '@/wallet/core/providers/hosted/types/index.js'
import { DynamicHostedWalletProvider } from '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'

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

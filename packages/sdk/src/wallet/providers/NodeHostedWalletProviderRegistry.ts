import { HostedWalletProviderRegistry } from '@/wallet/providers/base/HostedWalletProviderRegistry.js'
import type { PrivyOptions } from '@/wallet/providers/hostedProvider.types.js'
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'

/**
 * Node environment hosted wallet registry.
 * Registers server-safe providers for use in Node.
 */
export class NodeHostedWalletProviderRegistry extends HostedWalletProviderRegistry {
  public constructor() {
    super()
    this.register<'privy'>({
      type: 'privy',
      validateOptions(options): options is PrivyOptions {
        return Boolean((options as PrivyOptions)?.privyClient)
      },
      create({ chainManager }, options) {
        return new PrivyHostedWalletProvider(options.privyClient, chainManager)
      },
    })
  }
}

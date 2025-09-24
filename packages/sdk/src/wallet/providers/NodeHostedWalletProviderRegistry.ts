import { HostedWalletProviderRegistry } from '@/wallet/providers/base/HostedWalletProviderRegistry.js'
import type {
  PrivyOptions,
  TurnkeyOptions,
} from '@/wallet/providers/hostedProvider.types.js'
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'
import { TurnkeyHostedWalletProvider } from '@/wallet/providers/TurnkeyHostedWalletProvider.js'

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

    this.register<'turnkey'>({
      type: 'turnkey',
      validateOptions(options): options is TurnkeyOptions {
        const o = options as TurnkeyOptions
        return Boolean(o?.client) && typeof o?.organizationId === 'string'
      },
      create({ chainManager }, options) {
        return new TurnkeyHostedWalletProvider(
          options.client,
          options.organizationId,
          chainManager,
        )
      },
    })
  }
}

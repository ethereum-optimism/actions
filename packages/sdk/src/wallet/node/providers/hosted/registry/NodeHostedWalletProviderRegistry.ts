import { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
import { TurnkeyHostedWalletProvider } from '@/wallet/node/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js'
import type {
  NodeHostedProviderInstanceMap,
  NodeOptionsMap,
  NodeProviderTypes,
} from '@/wallet/node/providers/hosted/types/index.js'

/**
 * Node hosted wallet provider registry
 * @description
 * Environment-scoped registry that binds Node/server provider keys to their
 * factory implementations. This ensures browser-only hosted providers are
 * discoverable at runtime without importing Node-only code. The registry
 * pre-registers 'privy' and 'turnkey' providers and can be extended with
 * additional providers via `register`.
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
      create({ chainManager, lendProvider }, options) {
        return new PrivyHostedWalletProvider({
          privyClient: options.privyClient,
          chainManager,
          lendProvider,
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
      create({ chainManager, lendProvider }, options) {
        return new TurnkeyHostedWalletProvider(
          options.client,
          chainManager,
          lendProvider,
        )
      },
    })
  }
}

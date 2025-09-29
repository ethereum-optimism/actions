import { HostedWalletProviderRegistry } from '@/wallet/core/providers/hosted/registry/HostedWalletProviderRegistry.js'
import { DynamicHostedWalletProvider } from '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'
import type {
  ReactHostedProviderInstanceMap,
  ReactOptionsMap,
  ReactProviderTypes,
} from '@/wallet/react/providers/hosted/types/index.js'

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
      create({ chainManager }, _options) {
        return new DynamicHostedWalletProvider(chainManager)
      },
    })
  }
}

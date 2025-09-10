import type {
  HostedProviderFactory,
  HostedProviderType,
  PrivyOptions,
} from '@/wallet/providers/hostedProvider.types.js'
import { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'

export class HostedWalletProviderRegistry {
  private readonly registry = new Map<
    HostedProviderType,
    HostedProviderFactory
  >()

  public constructor() {
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

  getFactory<TType extends HostedProviderType>(type: TType) {
    const factory = this.registry.get(type) as
      | HostedProviderFactory<TType>
      | undefined
    if (!factory) throw new Error(`Unknown hosted wallet provider: ${type}`)
    return factory
  }

  private register<T extends HostedProviderType>(
    factory: HostedProviderFactory<T>,
  ) {
    if (!this.registry.has(factory.type))
      this.registry.set(factory.type, factory)
  }
}

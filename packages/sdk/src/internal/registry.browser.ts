import { DynamicHostedWalletProvider } from '@/wallet/providers/DynamicHostedWalletProvider.js'
import type {
  DynamicOptions,
  HostedProviderFactory,
  HostedProviderType,
} from '@/wallet/providers/hostedProvider.types.js'

export class HostedWalletProviderRegistry {
  private readonly registry = new Map<
    HostedProviderType,
    HostedProviderFactory<HostedProviderType>
  >()

  public constructor() {
    this.register<'dynamic'>({
      type: 'dynamic',
      validateOptions(_options): _options is DynamicOptions {
        return true
      },
      create({ chainManager }) {
        return new DynamicHostedWalletProvider(chainManager)
      },
    })
  }

  getFactory<TType extends HostedProviderType>(
    type: TType,
  ): HostedProviderFactory<TType> {
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

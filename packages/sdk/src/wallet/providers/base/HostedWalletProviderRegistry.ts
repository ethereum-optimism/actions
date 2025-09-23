import type {
  HostedProviderFactory,
  HostedProviderType,
} from '@/wallet/providers/hostedProvider.types.js'

/**
 * Base registry for hosted wallet providers.
 * Maintains a map of provider factories keyed by provider type.
 * Environment-specific subclasses register available providers.
 */
export abstract class HostedWalletProviderRegistry {
  protected readonly registry = new Map<
    HostedProviderType,
    HostedProviderFactory<HostedProviderType>
  >()

  /**
   * Get a provider factory by type.
   * Throws if the provider type is not registered.
   */
  getFactory<TType extends HostedProviderType>(
    type: TType,
  ): HostedProviderFactory<TType> {
    const factory = this.registry.get(type) as
      | HostedProviderFactory<TType>
      | undefined
    if (!factory) throw new Error(`Unknown hosted wallet provider: ${type}`)
    return factory
  }

  /**
   * Register a provider factory if not already present.
   * Intended for use by subclasses during construction.
   */
  protected register<T extends HostedProviderType>(
    factory: HostedProviderFactory<T>,
  ) {
    if (!this.registry.has(factory.type))
      this.registry.set(factory.type, factory)
  }
}

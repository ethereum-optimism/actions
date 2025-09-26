import type { HostedProviderFactory } from '@/wallet/core/providers/hosted/types/index.js'

/**
 * Base registry for hosted wallet providers.
 * Maintains a map of provider factories keyed by provider type.
 * Environment-specific subclasses register available providers.
 */
export abstract class HostedWalletProviderRegistry<
  TInstanceMap extends Record<TProviderType, unknown>,
  TConfigMap extends Record<TProviderType, unknown>,
  TProviderType extends keyof TInstanceMap & keyof TConfigMap & string,
> {
  protected readonly registry = new Map<
    TProviderType,
    HostedProviderFactory<
      TProviderType,
      TInstanceMap[TProviderType],
      TConfigMap[TProviderType]
    >
  >()

  /**
   * Get a provider factory by type.
   * Throws if the provider type is not registered.
   */
  getFactory<TType extends TProviderType>(
    type: TType,
  ): HostedProviderFactory<TType, TInstanceMap[TType], TConfigMap[TType]> {
    const factory = this.registry.get(type) as
      | HostedProviderFactory<TType, TInstanceMap[TType], TConfigMap[TType]>
      | undefined
    if (!factory) throw new Error(`Unknown hosted wallet provider: ${type}`)
    return factory
  }

  /**
   * Register a provider factory if not already present.
   * Intended for use by subclasses during construction.
   */
  protected register<T extends TProviderType>(
    factory: HostedProviderFactory<T, TInstanceMap[T], TConfigMap[T]>,
  ) {
    if (!this.registry.has(factory.type))
      this.registry.set(factory.type, factory)
  }
}

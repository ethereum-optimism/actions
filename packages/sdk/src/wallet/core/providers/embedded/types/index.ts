import type { ChainManager } from '@/services/ChainManager.js'
import type { SwapSettings } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import type { EmbeddedWalletProvider } from '@/wallet/core/providers/embedded/abstract/EmbeddedWalletProvider.js'

/**
 * Common dependencies provided to hosted provider factories
 * @description
 * Environment-agnostic services that providers require at creation time.
 * Currently limited to `ChainManager`, but can be extended as needed.
 */
export interface EmbeddedProviderDeps {
  chainManager: ChainManager
  lendProviders?: LendProviders
  swapProviders?: SwapProviders
  supportedAssets?: Asset[]
  swapSettings?: SwapSettings
}

/**
 * Provider registration specification
 * @description
 * Declarative description of a embedded wallet provider used when registering
 * a provider factory in a registry.
 * @template TType Unique provider key (e.g. 'privy', 'turnkey')
 * @template TConfig Configuration object type for the provider
 */
export type ProviderSpec<
  TType extends string,
  TConfigMap extends { [K in TType]: unknown | undefined },
> = {
  [K in TType]: undefined extends TConfigMap[K]
    ? { type: K }
    : { type: K; config: TConfigMap[K] }
}[TType]

/**
 * Embedded wallet provider factory
 * @description
 * Factory contract used by registries to validate configuration and create
 * concrete embedded wallet provider instances.
 * @template TType Unique provider key
 * @template TInstance Concrete provider instance produced by this factory
 * @template TOptions Options type accepted by `validateOptions` and `create`
 */
export interface EmbeddedProviderFactory<
  TType extends string,
  TInstance,
  TOptions = unknown,
> {
  type: TType
  validateOptions(options: unknown): options is TOptions
  create(
    deps: EmbeddedProviderDeps,
    options: TOptions,
  ): TInstance | Promise<TInstance>
}

/**
 * Complete embedded wallet providers schema (environment-agnostic)
 * @description
 * Bundles provider type keys, concrete provider instances, creation configs,
 * and `toActionsWallet` parameter types for a given environment (Node or React).
 * This schema enables precise typing in `Actions` and registries without widening
 * keys to generic `string`.
 * @template ProviderTypes Union of provider keys for the environment
 * @template ProviderInstanceMap Map of provider key to concrete instance
 * @template ProviderConfigMap Map of provider key to factory config type
 * @template ToActionsOptionsMap Map of provider key to `toActionsWallet` params
 */
export type EmbeddedWalletProvidersSchema<
  ProviderTypes extends string,
  ProviderInstanceMap extends {
    [K in ProviderTypes]: EmbeddedWalletProvider<K, ToActionsOptionsMap>
  },
  ProviderConfigMap extends { [K in ProviderTypes]: unknown },
  ToActionsOptionsMap extends { [K in ProviderTypes]: unknown },
> = {
  providerTypes: ProviderTypes
  providerInstances: ProviderInstanceMap
  providerConfigs: ProviderConfigMap
  providerToActionsOptions: ToActionsOptionsMap
}

import type { ChainManager } from '@/services/ChainManager.js'
import type { LendConfig, LendProvider } from '@/types/lend/index.js'
import type { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'

/**
 * Common dependencies provided to hosted provider factories
 * @description
 * Environment-agnostic services that providers require at creation time.
 * Currently limited to `ChainManager`, but can be extended as needed.
 */
export interface HostedProviderDeps {
  chainManager: ChainManager
  lendProvider?: LendProvider<LendConfig>
}

/**
 * Provider registration specification
 * @description
 * Declarative description of a hosted wallet provider used when registering
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
 * Hosted wallet provider factory
 * @description
 * Factory contract used by registries to validate configuration and create
 * concrete hosted wallet provider instances.
 * @template TType Unique provider key
 * @template TInstance Concrete provider instance produced by this factory
 * @template TOptions Options type accepted by `validateOptions` and `create`
 */
export interface HostedProviderFactory<
  TType extends string,
  TInstance,
  TOptions = unknown,
> {
  type: TType
  validateOptions(options: unknown): options is TOptions
  create(deps: HostedProviderDeps, options: TOptions): TInstance
}

/**
 * Complete hosted wallet providers schema (environment-agnostic)
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
export type HostedWalletProvidersSchema<
  ProviderTypes extends string,
  ProviderInstanceMap extends {
    [K in ProviderTypes]: HostedWalletProvider<K, ToActionsOptionsMap>
  },
  ProviderConfigMap extends { [K in ProviderTypes]: unknown },
  ToActionsOptionsMap extends { [K in ProviderTypes]: unknown },
> = {
  providerTypes: ProviderTypes
  providerInstances: ProviderInstanceMap
  providerConfigs: ProviderConfigMap
  providerToActionsOptions: ToActionsOptionsMap
}

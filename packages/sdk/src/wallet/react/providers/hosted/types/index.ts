import type { Wallet as DynamicWallet } from '@dynamic-labs/wallet-connector-core'

import type { HostedWalletProvidersSchema } from '@/wallet/core/providers/hosted/types/index.js'
import type { DynamicHostedWalletProvider } from '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'

/**
 * React provider type keys
 * @description
 * Narrow union of provider identifiers supported in the React/browser environment.
 * Uses an intersection of the keys from each map to help keep maps in sync
 * at compile time.
 */
export type ReactProviderTypes = keyof ReactOptionsMap &
  keyof ReactHostedProviderInstanceMap

/**
 * Configuration options per React hosted wallet provider
 * @description
 * Strongly-typed configuration inputs passed to each provider factory when
 * creating a hosted wallet provider for React. The Dynamic provider has no
 * build-time options.
 */
export interface ReactOptionsMap {
  dynamic: undefined
}

/**
 * Options for converting a Dynamic hosted wallet to a Verbs wallet
 * @description Parameters for converting a hosted wallet to a Verbs wallet
 * @property wallet Dynamic wallet instance obtained from the Dynamic connector
 */
export type DynamicHostedWalletToVerbsWalletOptions = {
  wallet: DynamicWallet
}

/**
 * React/browser hosted wallet registry
 * @description Registers browser-only providers for client apps.
 */
export type ReactHostedProviderInstanceMap = {
  dynamic: DynamicHostedWalletProvider
}

/**
 * Parameters required to convert each hosted wallet to a Verbs wallet (React)
 * @description Provider-specific, caller-supplied data needed by `toVerbsWallet`.
 */
export type ReactToVerbsOptionsMap = {
  dynamic: DynamicHostedWalletToVerbsWalletOptions
}

/**
 * Complete React hosted wallet providers schema
 * @description
 * Bundles provider type keys, concrete provider instances, creation configs,
 * and `toVerbsWallet` parameter types for the React environment.
 * This schema is used to type `Verbs` and its registries without widening
 * to generic `string` keys.
 */
export type ReactHostedWalletProvidersSchema = HostedWalletProvidersSchema<
  ReactProviderTypes,
  ReactHostedProviderInstanceMap,
  ReactOptionsMap,
  ReactToVerbsOptionsMap
>

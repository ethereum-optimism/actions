import type { PrivyClient } from '@privy-io/server-auth'

import type { ChainManager } from '@/services/ChainManager.js'
import type {
  DynamicHostedWalletToVerbsWalletOptions,
  PrivyHostedWalletToVerbsWalletOptions,
} from '@/types/wallet.js'
import type { DynamicHostedWalletProvider } from '@/wallet/providers/DynamicHostedWalletProvider.js'
import type { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'

export interface PrivyOptions {
  privyClient: PrivyClient
}

export type DynamicOptions = undefined
export interface HostedProviderConfigMap {
  privy: PrivyOptions
  dynamic: DynamicOptions
}

export interface HostedProviderInstanceMap {
  privy: PrivyHostedWalletProvider
  dynamic: DynamicHostedWalletProvider
}

export interface HostedWalletToVerbsOptionsMap {
  privy: PrivyHostedWalletToVerbsWalletOptions
  dynamic: DynamicHostedWalletToVerbsWalletOptions
}

export type HostedProviderType = keyof HostedProviderConfigMap

export type HostedWalletToVerbsType = keyof HostedWalletToVerbsOptionsMap

export interface HostedProviderDeps {
  chainManager: ChainManager
}

export type ProviderSpec<TType extends HostedProviderType> = {
  type: TType
  config?: HostedProviderConfigMap[TType]
}

export interface HostedProviderFactory<TType extends HostedProviderType> {
  type: TType
  validateOptions(options: unknown): options is HostedProviderConfigMap[TType]
  create(
    deps: HostedProviderDeps,
    options: HostedProviderConfigMap[TType],
  ): HostedProviderInstanceMap[TType]
}

// Helper to get options type for a given provider type
export type HostedWalletToVerbsOptionsFor<T extends HostedProviderType> =
  HostedWalletToVerbsOptionsMap[T]

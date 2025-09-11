import type { PrivyClient } from '@privy-io/server-auth'

import type { ChainManager } from '@/services/ChainManager.js'
import type { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'
import type { PrivyHostedWalletProvider } from '@/wallet/providers/PrivyHostedWalletProvider.js'

export interface PrivyOptions {
  privyClient: PrivyClient
}
export interface HostedProviderConfigMap {
  privy: PrivyOptions
}

export interface HostedProviderInstanceMap {
  privy: PrivyHostedWalletProvider
}

export type HostedProviderType = keyof HostedProviderConfigMap

export interface HostedProviderDeps {
  chainManager: ChainManager
}

export type ProviderSpec<TType extends HostedProviderType> = {
  type: TType
  config: HostedProviderConfigMap[TType]
}

export interface HostedProviderFactory<
  TType extends HostedProviderType = HostedProviderType,
  TOptions = HostedProviderConfigMap[TType],
  TInstance extends HostedWalletProvider = HostedProviderInstanceMap[TType],
> {
  type: TType
  validateOptions(options: unknown): options is TOptions
  create(deps: HostedProviderDeps, options: TOptions): TInstance
}

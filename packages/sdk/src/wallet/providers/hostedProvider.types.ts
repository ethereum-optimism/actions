import type { PrivyClient } from '@privy-io/server-auth'

import type { ChainManager } from '@/services/ChainManager.js'
import type { HostedWalletProvider } from '@/wallet/providers/base/HostedWalletProvider.js'

export interface PrivyOptions {
  privyClient: PrivyClient
}

export interface HostedProviderConfigMap {
  privy: PrivyOptions
}

export type HostedProviderType = keyof HostedProviderConfigMap

export interface HostedProviderDeps {
  chainManager: ChainManager
}

export interface HostedProviderFactory<
  TType extends HostedProviderType = HostedProviderType,
  TOptions = HostedProviderConfigMap[TType],
> {
  type: TType
  validateOptions(options: unknown): options is TOptions
  create(deps: HostedProviderDeps, options: TOptions): HostedWalletProvider
}

export type HostedProviderUnion = {
  [K in HostedProviderType]: { type: K; config: HostedProviderConfigMap[K] }
}[HostedProviderType]

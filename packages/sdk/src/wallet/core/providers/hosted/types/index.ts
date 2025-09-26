import type { PrivyClient } from '@privy-io/server-auth'
import type { TurnkeySDKClientBase } from '@turnkey/core'
import type { TurnkeyClient as TurnkeyHttpClient } from '@turnkey/http'
import type { TurnkeyServerClient } from '@turnkey/sdk-server'

import type { ChainManager } from '@/services/ChainManager.js'
import type {
  DynamicHostedWalletToVerbsWalletOptions,
  PrivyHostedWalletToVerbsWalletOptions,
  TurnkeyHostedWalletToVerbsWalletOptions,
} from '@/types/wallet.js'
import type { PrivyHostedWalletProvider } from '@/wallet/node/providers/hosted/privy/PrivyHostedWalletProvider.js'
import type { TurnkeyHostedWalletProvider } from '@/wallet/node/providers/hosted/turnkey/TurnkeyHostedWalletProvider.js'
import type { DynamicHostedWalletProvider } from '@/wallet/react/providers/hosted/dynamic/DynamicHostedWalletProvider.js'

export interface PrivyOptions {
  privyClient: PrivyClient
}

export interface TurnkeyOptions {
  /**
   * Turnkey client instance (HTTP, server, or core SDK base)
   */
  client: TurnkeyHttpClient | TurnkeyServerClient | TurnkeySDKClientBase
  /**
   * Turnkey organization ID that owns the signing key
   */
  organizationId: string
}

export type DynamicOptions = undefined
export interface HostedProviderConfigMap {
  privy: PrivyOptions
  dynamic: DynamicOptions
  turnkey: TurnkeyOptions
}

export interface HostedProviderInstanceMap {
  privy: PrivyHostedWalletProvider
  dynamic: DynamicHostedWalletProvider
  turnkey: TurnkeyHostedWalletProvider
}

export interface HostedWalletToVerbsOptionsMap {
  privy: PrivyHostedWalletToVerbsWalletOptions
  dynamic: DynamicHostedWalletToVerbsWalletOptions
  turnkey: TurnkeyHostedWalletToVerbsWalletOptions
}

export type HostedProviderType = keyof HostedProviderConfigMap

export type NodeHostedProviderType = Extract<
  HostedProviderType,
  'privy' | 'turnkey'
>

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

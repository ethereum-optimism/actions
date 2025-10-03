import type { ChainConfig } from '@/types/chain.js'
import type { LendConfig } from '@/types/lend/index.js'
import type { ProviderSpec } from '@/wallet/core/providers/hosted/types/index.js'

/**
 * Network configuration for lending providers
 * @description Basic network information that lending providers need
 */
export interface LendNetworkConfig {
  chainId: number
  name: string
}

/**
 * Actions SDK configuration
 * @description Configuration object for initializing the Actions SDK
 */
export interface ActionsConfig<
  THostedWalletProviderType extends string,
  TConfigMap extends { [K in THostedWalletProviderType]: unknown },
> {
  /** Wallet configuration */
  wallet: WalletConfig<THostedWalletProviderType, TConfigMap>
  /** Lending provider configuration (optional) */
  lend?: LendConfig
  /** Chains to use for the SDK */
  chains: ChainConfig[]
}

/**
 * Wallet configuration
 * @description Configuration for wallet providers
 */
export type WalletConfig<
  THostedProviderType extends string,
  TConfigMap extends { [K in THostedProviderType]: unknown },
> = {
  /** Hosted wallet configuration */
  hostedWalletConfig: HostedWalletConfig<THostedProviderType, TConfigMap>
  /** Smart wallet configuration for ERC-4337 infrastructure */
  smartWalletConfig: SmartWalletConfig
}

/**
 * Hosted wallet configuration
 * @description Configuration for hosted wallets / signers
 */
export interface HostedWalletConfig<
  THostedProviderType extends string,
  TConfigMap extends { [K in THostedProviderType]: unknown },
> {
  /** Wallet provider for account creation, management, and signing */
  provider: ProviderSpec<THostedProviderType, TConfigMap>
}

/**
 * Smart Wallet configuration
 * @description Configuration for ERC-4337 smart wallets.
 */
export interface SmartWalletConfig {
  /** Wallet provider for smart wallet management */
  provider: SmartWalletProvider
}

/**
 * Smart wallet provider configurations
 * @description Union type supporting multiple wallet provider implementations
 */
export type SmartWalletProvider = DefaultSmartWalletProvider

/**
 * Default smart wallet provider configuration
 * @description Built-in provider smart wallet provider.
 */
export interface DefaultSmartWalletProvider {
  type: 'default'
  // This string will be converted to a 16-byte hex suffix appended to callData and initCode
  // on all ERC-4337 UserOperations
  attributionSuffix?: string
}

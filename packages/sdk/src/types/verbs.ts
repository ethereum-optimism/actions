import type { ChainConfig } from '@/types/chain.js'
import type {
  HostedProviderType,
  ProviderSpec,
} from '@/wallet/providers/hostedProvider.types.js'

import type { LendConfig } from './lend.js'

/**
 * Network configuration for lending providers
 * @description Basic network information that lending providers need
 */
export interface LendNetworkConfig {
  chainId: number
  name: string
}

/**
 * Verbs SDK configuration
 * @description Configuration object for initializing the Verbs SDK
 */
export interface VerbsConfig<
  THostedWalletProviderType extends HostedProviderType,
> {
  /** Wallet configuration */
  wallet: WalletConfig<THostedWalletProviderType>
  /** Lending provider configuration (optional) */
  lend?: LendConfig
  /** Chains to use for the SDK */
  chains: ChainConfig[]
}

/**
 * Wallet configuration
 * @description Configuration for wallet providers
 */
export type WalletConfig<THostedProviderType extends HostedProviderType> = {
  /** Hosted wallet configuration */
  hostedWalletConfig: HostedWalletConfig<THostedProviderType>
  /** Smart wallet configuration for ERC-4337 infrastructure */
  smartWalletConfig: SmartWalletConfig
}

/**
 * Hosted wallet configuration
 * @description Configuration for hosted wallets / signers
 */
export interface HostedWalletConfig<
  THostedProviderType extends HostedProviderType,
> {
  /** Wallet provider for account creation, management, and signing */
  provider: ProviderSpec<THostedProviderType>
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

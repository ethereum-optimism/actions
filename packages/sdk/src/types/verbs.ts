import type { PrivyClient } from '@privy-io/server-auth'

import type { ChainConfig } from '@/types/chain.js'

import type { LendConfig } from './lend.js'

/**
 * Verbs SDK configuration
 * @description Configuration object for initializing the Verbs SDK
 */
export interface VerbsConfig {
  /** Wallet configuration */
  wallet: WalletConfig
  /** Lending provider configuration (optional) */
  lend?: LendConfig
  /** Chains to use for the SDK */
  chains: ChainConfig[]
}

/**
 * Wallet configuration
 * @description Configuration for wallet providers
 */
export type WalletConfig = {
  /** Hosted wallet configuration */
  hostedWalletConfig: HostedWalletConfig
  /** Smart wallet configuration for ERC-4337 infrastructure */
  smartWalletConfig: SmartWalletConfig
}

/**
 * Hosted wallet configuration
 * @description Configuration for hosted wallets / signers
 */
export interface HostedWalletConfig {
  /** Wallet provider for account creation, management, and signing */
  provider: HostedWalletProviderConfig
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
}

/**
 * Hosted wallet provider configurations
 * @description Union type supporting multiple hosted wallet providers
 */
export type HostedWalletProviderConfig = PrivyHostedWalletProviderConfig

/** Privy hosted wallet provider configuration */
export interface PrivyHostedWalletProviderConfig {
  /** Hosted wallet provider type */
  type: 'privy'
  /** Privy client instance */
  privyClient: PrivyClient
}

import type { UniswapSwapProviderConfig } from '@/swap/providers/uniswap/types.js'
import type { VelodromeSwapProviderConfig } from '@/swap/providers/velodrome/types.js'
import type { Asset } from '@/types/asset.js'
import type { ChainConfig } from '@/types/chain.js'
import type { LendProviderConfig } from '@/types/lend/index.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import type { SwapProviderConfig } from '@/types/swap/index.js'
import type { ProviderSpec } from '@/wallet/core/providers/embedded/types/index.js'

// Re-export provider configs for convenience
export type { LendProviderConfig, SwapProviderConfig }
// Re-export centralized provider maps
export type { LendProviders, SwapProviders } from '@/types/providers.js'

/** Require at least one property to be defined */
type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>
}[keyof T]

/**
 * Lending configuration — at least one provider must be configured
 */
export type LendConfig = RequireAtLeastOne<{
  [K in keyof LendProviders]: LendProviderConfig
}>

/** Names of available swap providers — derived from SwapProviders registry */
export type SwapProviderName = keyof SwapProviders

/** Names of available lend providers — derived from LendProviders registry */
export type LendProviderName = keyof LendProviders

/** Routing strategy for selecting a provider when multiple are configured. */
export type SwapRoutingStrategy = 'price'

/**
 * Shared swap settings applied across all providers.
 * Provider-level values override these when set.
 */
export interface SwapSettings {
  /** Default slippage tolerance (e.g., 0.005 for 0.5%). Defaults to 0.005. */
  defaultSlippage?: number
  /** Maximum allowed slippage (e.g., 0.5 for 50%). Defaults to 0.5. */
  maxSlippage?: number
  /** Quote expiration in seconds from now. Defaults to 60. */
  quoteExpirationSeconds?: number
  /** Permit2 sub-approval expiration in seconds from now. Defaults to 2592000 (30 days). */
  permit2ExpirationSeconds?: number
  /**
   * Routing strategy for multi-provider selection.
   * 'price' fetches quotes from all eligible providers and returns the best price.
   * Omit to fall back to market-matching heuristics.
   */
  routing?: SwapRoutingStrategy
  /** Provider to prefer when routing produces a tie, or to always use when no routing strategy is set. */
  defaultProvider?: SwapProviderName
}

/**
 * Swap configuration — at least one provider must be configured.
 * Shared settings go in `config`; per-provider settings go under the provider key.
 */
export type SwapConfig = RequireAtLeastOne<{
  /** Uniswap swap provider configuration */
  uniswap?: UniswapSwapProviderConfig
  /** Velodrome/Aerodrome swap provider configuration */
  velodrome?: VelodromeSwapProviderConfig
}> & {
  /** Shared settings applied across all providers */
  settings?: SwapSettings
}

/**
 * Network configuration for lending providers
 * @description Basic network information that lending providers need
 */
export interface LendNetworkConfig {
  chainId: number
  name: string
}

/**
 * Assets configuration
 * @description Configuration for supported assets. Import token constants from the SDK
 * or define your own Asset objects.
 */
export interface AssetsConfig {
  /** Allowlist of assets to support. No default — developers must explicitly configure. */
  allow?: Asset[]
  /** Blocklist of assets to exclude from the allow list. Only effective when allow is also set. For future use with runtime asset fetching. */
  block?: Asset[]
}

/**
 * Actions SDK configuration
 * @description Configuration object for initializing the Actions SDK
 */
export interface ActionsConfig<
  TEmbeddedWalletProviderType extends string,
  TConfigMap extends { [K in TEmbeddedWalletProviderType]: unknown },
> {
  /** Wallet configuration */
  wallet: WalletConfig<TEmbeddedWalletProviderType, TConfigMap>
  /** Lending providers configuration (optional) */
  lend?: LendConfig
  /** Swap providers configuration (optional) */
  swap?: SwapConfig
  /** Assets configuration (optional) */
  assets?: AssetsConfig
  /** Chains to use for the SDK */
  chains: ChainConfig[]
}

/**
 * Wallet configuration
 * @description Configuration for wallet providers
 */
export type WalletConfig<
  TEmbeddedProviderType extends string,
  TConfigMap extends { [K in TEmbeddedProviderType]: unknown },
> = {
  /** Embedded wallet configuration */
  embeddedWalletConfig: HostedWalletConfig<TEmbeddedProviderType, TConfigMap>
  /** Smart wallet configuration for ERC-4337 infrastructure */
  smartWalletConfig: SmartWalletConfig
}

/**
 * Embedded wallet configuration
 * @description Configuration for embedded wallets / signers
 */
export interface HostedWalletConfig<
  TEmbeddedProviderType extends string,
  TConfigMap extends { [K in TEmbeddedProviderType]: unknown },
> {
  /** Wallet provider for account creation, management, and signing */
  provider: ProviderSpec<TEmbeddedProviderType, TConfigMap>
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

import type { UniswapSwapProviderConfig } from '@/actions/swap/providers/uniswap/types.js'
import type { VelodromeSwapProviderConfig } from '@/actions/swap/providers/velodrome/types.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type { ChainConfig } from '@/types/chain.js'
import type { LendProviderConfig } from '@/types/lend/index.js'
import type {
  LendProviders,
  SwapProviderName,
  SwapProviders,
} from '@/types/providers.js'
import type { SwapProviderConfig } from '@/types/swap/index.js'
import type { ProviderSpec } from '@/wallet/core/providers/hosted/types/index.js'

// Re-export provider configs for convenience
export type { LendProviderConfig, SwapProviderConfig }
// Re-export centralized provider maps and constants
export type {
  LendProviderName,
  LendProviders,
  SwapProviderName,
  SwapProviders,
} from '@/types/providers.js'
export { LEND_PROVIDER_NAMES, SWAP_PROVIDER_NAMES } from '@/types/providers.js'

/** Require at least one property to be defined */
type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>
}[keyof T]

/**
 * Shared lend settings applied across all providers.
 * Provider-level values override these when set.
 */
export interface LendSettings {
  /**
   * Default approval-amount strategy for ERC-20 → market approvals on supply.
   * Per-call params override this; provider-level config overrides it for a
   * single provider.
   */
  approvalMode?: ApprovalMode
}

/**
 * Lending configuration — at least one provider must be configured.
 * Shared settings go in `settings`; per-provider settings go under the provider key.
 */
export type LendConfig = RequireAtLeastOne<{
  [K in keyof LendProviders]: LendProviderConfig
}> & {
  /** Shared settings applied across all lend providers */
  settings?: LendSettings
}

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
  /**
   * Default approval-amount strategy for swap approvals (Permit2 outer +
   * inner). Per-call params override this; provider-level config overrides it
   * for a single provider.
   */
  approvalMode?: ApprovalMode
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
 * Shared dependencies derived from `ActionsConfig` at SDK construction time.
 * @description Immutable bundle of resolved providers and services that the
 * Actions SDK threads through its internal namespaces. Consumers that need
 * provider references should receive an `ActionsContext` rather than a raw
 * `ActionsConfig` — the providers in the context are already constructed and
 * hold their own per-provider configuration (market allowlists, slippage
 * defaults, etc.).
 */
export interface ActionsContext {
  /** Chain manager wrapping the configured chains */
  chainManager: ChainManager
  /** Configured lend provider instances (each holds its own config) */
  lendProviders: LendProviders
  /** Configured swap provider instances (each holds its own config) */
  swapProviders: SwapProviders
  /** Resolved supported asset list (allowlist minus blocklist) */
  supportedAssets: Asset[]
  /** Shared swap settings applied across swap providers */
  swapSettings?: SwapSettings
}

/**
 * Approval amount strategy used when the SDK needs to grant a contract
 * permission to spend the user's tokens (Permit2, Aave Pool, Morpho vault, ...).
 *
 * `"exact"` approves exactly the amount required for the current operation.
 * Each subsequent operation needs its own approval transaction.
 *
 * `"max"` approves `maxUint256` for ERC-20 spenders / `maxUint160` for
 * Permit2's inner allowance. Subsequent operations skip the re-approval
 * round trip until the underlying allowance is consumed or expires.
 *
 * Default is `"exact"` for safety. Demo / dogfood configs typically opt into
 * `"max"` to avoid an extra approval tx per swap or supply.
 */
export const APPROVAL_MODES = ['exact', 'max'] as const

export type ApprovalMode = (typeof APPROVAL_MODES)[number]

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
 * @description Configuration for wallet providers. `hostedWalletConfig` is
 * optional; when omitted, `wallet.toActionsWallet` accepts only a viem
 * `LocalAccount` and `wallet.createSigner` / `wallet.hostedWalletProvider`
 * are not available.
 */
export type WalletConfig<
  THostedProviderType extends string,
  TConfigMap extends { [K in THostedProviderType]: unknown },
> = {
  /** Hosted wallet configuration (optional) */
  hostedWalletConfig?: HostedWalletConfig<THostedProviderType, TConfigMap>
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

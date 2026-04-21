import type { LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { SwapSettings } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import type {
  CreateSmartWalletOptions,
  GetSmartWalletOptions,
} from '@/types/wallet.js'
import type { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { SmartWalletProvider } from '@/wallet/core/providers/smart/abstract/SmartWalletProvider.js'
import type { SmartWalletCreationResult } from '@/wallet/core/providers/smart/abstract/types/index.js'
import type { WalletProvider } from '@/wallet/core/providers/WalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { SmartWallet } from '@/wallet/core/wallets/smart/abstract/SmartWallet.js'
import { LocalWallet } from '@/wallet/node/wallets/local/LocalWallet.js'

function isLocalAccount(value: unknown): value is LocalAccount {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  if (record.type !== 'local') {
    return false
  }
  if (typeof record.address !== 'string') {
    return false
  }
  if (
    typeof record.signMessage !== 'function' ||
    typeof record.signTransaction !== 'function'
  ) {
    return false
  }
  if ('signTypedData' in record && typeof record.signTypedData !== 'function') {
    return false
  }
  return true
}

/**
 * Provider factory function for lazy initialization
 */
type WalletProviderFactory<
  THostedProviderType extends string,
  TToActionsMap extends Record<THostedProviderType, unknown>,
  H extends HostedWalletProvider<THostedProviderType, TToActionsMap>,
  S extends SmartWalletProvider,
> = () => Promise<WalletProvider<THostedProviderType, TToActionsMap, H, S>>

/**
 * Wallet namespace that provides unified wallet operations
 * @description Provides access to wallet functionality through a single provider interface.
 * Supports lazy initialization — the wallet provider is created on first method call,
 * enabling tree-shaking of unused wallet provider dependencies.
 */
export class WalletNamespace<
  THostedProviderType extends string,
  TToActionsMap extends Record<THostedProviderType, unknown>,
  H extends HostedWalletProvider<THostedProviderType, TToActionsMap> =
    HostedWalletProvider<THostedProviderType, TToActionsMap>,
  S extends SmartWalletProvider = SmartWalletProvider,
> {
  private _provider: WalletProvider<
    THostedProviderType,
    TToActionsMap,
    H,
    S
  > | null = null
  private _providerFactory: WalletProviderFactory<
    THostedProviderType,
    TToActionsMap,
    H,
    S
  >
  private _initPromise: Promise<
    WalletProvider<THostedProviderType, TToActionsMap, H, S>
  > | null = null
  private readonly chainManager: ChainManager
  private readonly lendProviders: LendProviders
  private readonly swapProviders: SwapProviders
  private readonly supportedAssets: Asset[]
  private readonly swapSettings?: SwapSettings

  constructor(
    providerOrFactory:
      | WalletProvider<THostedProviderType, TToActionsMap, H, S>
      | WalletProviderFactory<THostedProviderType, TToActionsMap, H, S>,
    deps: {
      chainManager: ChainManager
      lendProviders?: LendProviders
      swapProviders?: SwapProviders
      supportedAssets?: Asset[]
      swapSettings?: SwapSettings
    },
  ) {
    if (typeof providerOrFactory === 'function') {
      this._providerFactory = providerOrFactory
    } else {
      this._provider = providerOrFactory
      this._providerFactory = () => Promise.resolve(providerOrFactory)
    }
    this.chainManager = deps.chainManager
    this.lendProviders = deps.lendProviders ?? {}
    this.swapProviders = deps.swapProviders ?? {}
    this.supportedAssets = deps.supportedAssets ?? []
    this.swapSettings = deps.swapSettings
  }

  /**
   * Get direct access to the hosted wallet provider
   * @description Provides direct access to the underlying hosted wallet provider when
   * advanced functionality beyond the unified interface is needed.
   * Lazily initializes the provider if not yet created.
   * @returns Promise resolving to the configured hosted wallet provider instance
   */
  async hostedWalletProvider(): Promise<H> {
    const provider = await this.resolveProvider()
    return provider.hostedWalletProvider
  }

  /**
   * Get direct access to the smart wallet provider
   * @description Provides direct access to the underlying smart wallet provider when
   * advanced functionality beyond the unified interface is needed.
   * Lazily initializes the provider if not yet created.
   * @returns Promise resolving to the configured smart wallet provider instance
   */
  async smartWalletProvider(): Promise<S> {
    const provider = await this.resolveProvider()
    return provider.smartWalletProvider
  }

  /**
   * Create a new smart wallet
   * @description Creates a smart wallet and attempts to deploy it across all supported chains.
   * The wallet address is deterministically calculated from signers and nonce. The signer must
   * be included in the signers array. Deployment failures on individual chains do not prevent
   * wallet creation - they are reported in the result.
   * @param params - Smart wallet creation parameters
   * @param params.signer - Primary local account used for signing transactions
   * @param params.signers - Optional array of additional signers for the smart wallet
   * @param params.nonce - Optional nonce for smart wallet address generation (defaults to 0)
   * @param params.deploymentChainIds - Optional chain IDs to deploy the wallet to.
   * If not provided, the wallet will be deployed to all supported chains.
   * @returns Promise resolving to deployment result containing:
   * - `wallet`: The created SmartWallet instance
   * - `deployments`: Array of deployment results with chainId, receipt, success flag, and error
   * @throws Error if signer is not included in the signers array
   */
  async createSmartWallet(
    params: CreateSmartWalletOptions,
  ): Promise<SmartWalletCreationResult<SmartWallet>> {
    const provider = await this.resolveProvider()
    return provider.createSmartWallet(params)
  }

  /**
   * Create a viem LocalAccount signer from the hosted wallet
   * @description Produces a signing account backed by the hosted wallet without wrapping
   * it in a full Actions wallet. This is useful when you need to pass the signer
   * into an Actions smart wallet as a signer, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Configuration for the signer
   * @returns Promise resolving to a viem `LocalAccount` with the hosted wallet as the signer backend
   */
  async createSigner(
    params: TToActionsMap[THostedProviderType],
  ): Promise<LocalAccount> {
    const provider = await this.resolveProvider()
    return provider.createSigner(params)
  }

  /**
   * Convert a hosted wallet or local account to an Actions wallet
   * @description Accepts either provider-specific params (for Privy/Turnkey) or a viem
   * LocalAccount directly. When a LocalAccount is passed, a LocalWallet is created
   * regardless of which hosted provider is configured.
   * @param params - Provider params or a viem LocalAccount
   * @returns Promise resolving to the Actions wallet instance
   */
  async toActionsWallet(
    params: TToActionsMap[THostedProviderType] | LocalAccount,
  ): Promise<Wallet> {
    if (isLocalAccount(params)) {
      return LocalWallet.create({
        account: params,
        chainManager: this.chainManager,
        lendProviders: this.lendProviders,
        swapProviders: this.swapProviders,
        supportedAssets: this.supportedAssets,
      })
    }
    const provider = await this.resolveProvider()
    return provider.hostedWalletToActionsWallet(params)
  }

  /**
   * Get an existing smart wallet with a provided signer
   * @description Retrieves a smart wallet using a directly provided signer. This is useful when
   * you already have a LocalAccount signer and want to access an existing smart wallet without
   * going through the hosted wallet provider. Use this instead of getSmartWalletWithHostedSigner
   * when you have direct control over the signer.
   * @param params - Wallet retrieval parameters
   * @param params.signer - Local account to use for signing transactions on the smart wallet
   * @param params.signers - Optional array of additional signers for the smart wallet
   * @param params.deploymentSigners - Optional array of signers used during wallet deployment
   * @param params.walletAddress - Optional explicit smart wallet address (skips address calculation)
   * @param params.nonce - Optional nonce used during smart wallet creation
   * @returns Promise resolving to the smart wallet instance with the provided signer
   * @throws Error if neither walletAddress nor deploymentSigners provided
   */
  async getSmartWallet(params: GetSmartWalletOptions) {
    const provider = await this.resolveProvider()
    return provider.getSmartWallet(params)
  }

  private resolveProvider(): Promise<
    WalletProvider<THostedProviderType, TToActionsMap, H, S>
  > {
    if (this._provider) return Promise.resolve(this._provider)
    if (!this._initPromise) {
      this._initPromise = this._providerFactory().then((provider) => {
        this._provider = provider
        return provider
      })
    }
    return this._initPromise
  }
}

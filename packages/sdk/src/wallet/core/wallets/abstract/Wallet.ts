import type { Address, LocalAccount } from 'viem'

import type { WalletBorrowNamespace } from '@/actions/borrow/namespaces/WalletBorrowNamespace.js'
import type { WalletLendNamespace } from '@/actions/lend/namespaces/WalletLendNamespace.js'
import { ACTION_MODULES, ACTION_NAMES } from '@/actions/registry.js'
import type {
  ActionModule,
  ActionModuleDeps,
} from '@/actions/shared/ActionModule.js'
import type { WalletSwapNamespace } from '@/actions/swap/namespaces/WalletSwapNamespace.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { fetchERC20Balance, fetchETHBalance } from '@/services/tokenBalance.js'
import type {
  ActionName,
  ActionProvidersMap,
  ActionSettingsMap,
} from '@/types/actionRegistry.js'
import type { Asset, BalanceFetchOptions, TokenBalance } from '@/types/asset.js'
import type { TransactionData } from '@/types/transaction.js'
import { validateBalanceFetchOptions } from '@/utils/validation.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

/**
 * Options handed to the `Wallet` super constructor.
 * @description Action-keyed maps; adding a new action does not require new
 * constructor params.
 */
export interface WalletConstructorOptions {
  chainManager: ChainManager
  actionProviders: ActionProvidersMap
  actionSettings: ActionSettingsMap
  supportedAssets?: Asset[]
}

/**
 * Shared shape for every concrete wallet's `*WalletCreateOptions`. Concrete
 * wallets extend this with their provider-specific construction fields.
 */
export type BaseWalletCreateOptions = WalletConstructorOptions

/**
 * Base actions wallet class
 * @description Abstract base class for actions wallet implementations.
 * Provides a standard interface for actions wallets.
 */
export abstract class Wallet {
  /** Lend namespace with all lending operations */
  lend?: WalletLendNamespace
  /** Borrow namespace with all borrow operations */
  borrow?: WalletBorrowNamespace
  /** Swap namespace with all swap operations */
  swap?: WalletSwapNamespace
  /** Provider instances keyed by action name. */
  protected actionProviders: ActionProvidersMap
  /** Shared settings keyed by action name. */
  protected actionSettings: ActionSettingsMap
  /** Manages supported blockchain networks and RPC clients */
  protected chainManager: ChainManager
  /** List of supported assets for this wallet */
  protected supportedAssets: Asset[]
  /** Promise to initialize the wallet */
  private initPromise?: Promise<void>

  /**
   * Get the address of this actions wallet
   * @description Returns the address of the actions wallet.
   * @returns The address of the actions wallet.
   */
  public abstract readonly address: Address
  /**
   * Get a signer for this actions wallet
   * @description Returns a LocalAccount that can be used to sign transactions and messages.
   * This can be used as the signer for smart wallet operations if the signer is an
   * owner on the smart wallet.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   */
  public abstract readonly signer: LocalAccount

  protected constructor(options: WalletConstructorOptions) {
    this.chainManager = options.chainManager
    this.actionProviders = options.actionProviders
    this.actionSettings = options.actionSettings
    this.supportedAssets = options.supportedAssets ?? []

    const moduleDeps: ActionModuleDeps = {
      chainManager: this.chainManager,
      supportedAssets: this.supportedAssets,
    }

    // One pass over the action registry attaches every configured
    // `wallet.<name>` namespace. Adding a future action (e.g. stake,
    // bridge, perp) is purely a registry entry — this loop, `Wallet`'s
    // shape, and every consumer of it stay unchanged.
    for (const name of ACTION_NAMES) {
      attachWalletNamespace(this, name, moduleDeps)
    }
  }

  /**
   * Check whether a wallet namespace (`lend`, `swap`, `borrow`) is
   * configured on this wallet. Useful for callers that branch on
   * capability instead of catching a `TypeError` later.
   * @param namespace - Wallet namespace name to probe.
   * @returns `true` when the namespace is configured.
   */
  has(namespace: ActionName): boolean {
    return this[namespace] !== undefined
  }

  /**
   * Get asset balances across the requested chains (or all supported chains).
   * @description Fetches ETH and ERC20 token balances for this wallet. By default queries every chain returned by the SDK's `ChainManager`. Pass `options.chainIds` to restrict the query to a subset of those chains; each id is validated against the configured chains and an `InvalidParamsError` / `ChainNotSupportedError` is thrown for unusable input. Uses the configured supported assets from `ActionsConfig.assets` if provided.
   * @param options - Optional `chainIds` filter
   * @returns Promise resolving to array of token balances with chain breakdown
   */
  async getBalance(options?: BalanceFetchOptions): Promise<TokenBalance[]> {
    validateBalanceFetchOptions(options, this.chainManager)
    return Promise.all([
      fetchETHBalance(this.chainManager, this.address, options),
      ...this.supportedAssets.map((asset) =>
        fetchERC20Balance(this.chainManager, this.address, asset, options),
      ),
    ])
  }

  /**
   * Perform subclass-specific one-time initialization
   * @description Hook for concrete wallet implementations to perform their
   * required setup (e.g., compute and cache address, create signer/account,
   * warm caches). This method is invoked by {@link initialize} and should not
   * be called directly by consumers.
   *
   * Implementations should set all internal state required for public methods
   * to operate safely after initialization completes, and should throw on
   * failure so {@link initialize} can surface the error to callers.
   *
   * Note: This hook is expected to be idempotent in effect when called via
   * {@link initialize}, which guarantees concurrency-safety and ensures it is
   * executed at most once per instance.
   * @returns Promise that resolves when initialization work is complete
   */
  protected async performInitialization(): Promise<void> {}

  /**
   * Initialize the wallet (idempotent and concurrency-safe)
   * @description Public-facing initialization entrypoint used internally by
   * factories/providers and defensively by public methods. If initialization is
   * already in-flight or completed, subsequent calls will await the same
   * promise, preventing duplicate work and race conditions.
   *
   * On failure, the stored promise is cleared so callers may retry
   * initialization later.
   * @returns Promise that resolves once the wallet is fully initialized
   * @throws Error wrapping the underlying failure cause from
   * {@link performInitialization}
   */
  protected async initialize() {
    if (this.initPromise) return this.initPromise
    this.initPromise = (async () => {
      try {
        await this.performInitialization()
      } catch (error) {
        // Clear cached promise to allow retry after a failure
        this.initPromise = undefined
        throw new Error('Failed to initialize wallet', { cause: error })
      }
    })()
    return this.initPromise
  }

  /**
   * Send a transaction using this actions wallet
   * @description Executes a transaction through the actions wallet.
   * @param transactionData - The transaction data to execute
   * @param chainId - Target blockchain chain ID
   * @returns Promise resolving to the transaction hash
   */
  abstract send(
    transactionData: TransactionData,
    chainId: SupportedChainId,
  ): Promise<TransactionReturnType>

  /**
   * Send a batch of transactions using this actions wallet
   * @description Executes a batch of transactions through the actions wallet.
   * @param transactionData - The transaction data to execute
   * @param chainId - Target blockchain chain ID
   * @returns Promise resolving to the transaction hash
   */
  abstract sendBatch(
    transactionData: readonly TransactionData[],
    chainId: SupportedChainId,
  ): Promise<BatchTransactionReturnType>
}

/**
 * Build and attach the `wallet.<name>` namespace for one action. Generic
 * over `K` so each module's per-action types unify internally; the lone
 * cast at the slot write is the one place TS can't follow the registry
 * indirection. Adding a future action only requires declaring its
 * `name?: T` field on `Wallet` — this helper handles the rest.
 */
function attachWalletNamespace<K extends ActionName>(
  wallet: Wallet,
  name: K,
  moduleDeps: ActionModuleDeps,
): void {
  const module = ACTION_MODULES[name] as ActionModule<K>
  const providers = wallet['actionProviders'][name]
  if (
    !providers ||
    !module.isConfigured(providers) ||
    !module.buildWalletNamespace
  ) {
    return
  }
  const ns = module.buildWalletNamespace(
    providers,
    wallet,
    wallet['actionSettings'][name],
    moduleDeps,
  )
  ;(wallet as unknown as Record<K, unknown>)[name] = ns
}

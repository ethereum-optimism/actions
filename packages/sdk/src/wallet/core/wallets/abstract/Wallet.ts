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
import type { BorrowSettings, SwapSettings } from '@/types/actions.js'
import type { Asset, BalanceFetchOptions, TokenBalance } from '@/types/asset.js'
import type {
  BorrowProviders,
  LendProviders,
  SwapProviders,
} from '@/types/providers.js'
import type { TransactionData } from '@/types/transaction.js'
import { validateBalanceFetchOptions } from '@/utils/validation.js'
import type {
  BatchTransactionReturnType,
  TransactionReturnType,
} from '@/wallet/core/wallets/abstract/types/index.js'

/**
 * Options handed to the `Wallet` super constructor.
 * @description Replaces the legacy positional argument list. The action
 * map shapes are derived from `ActionModules`, so adding a new action
 * does not require new constructor params.
 */
export interface WalletConstructorOptions {
  chainManager: ChainManager
  actionProviders?: ActionProvidersMap
  actionSettings?: ActionSettingsMap
  supportedAssets?: Asset[]
}

/**
 * Shared shape for every concrete wallet's `*WalletCreateOptions`.
 * @description Same fields as `WalletConstructorOptions` (chainManager +
 * action-keyed providers/settings + supportedAssets); concrete wallets
 * extend this with their provider-specific construction fields
 * (connectedWallet, client + organizationId + signWith, walletId, etc.).
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

  /** Legacy mirror: lend providers from the action map. */
  protected get lendProviders(): LendProviders {
    return (this.actionProviders.lend ?? {}) as LendProviders
  }
  /** Legacy mirror: swap providers from the action map. */
  protected get swapProviders(): SwapProviders {
    return (this.actionProviders.swap ?? {}) as SwapProviders
  }
  /** Legacy mirror: borrow providers from the action map. */
  protected get borrowProviders(): BorrowProviders {
    return (this.actionProviders.borrow ?? {}) as BorrowProviders
  }

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

  /**
   * Create a new wallet (options form, preferred).
   *
   * Subclasses still on the legacy positional argument list keep working
   * via the second overload below; the legacy form is removed once every
   * concrete wallet migrates.
   */
  protected constructor(options: WalletConstructorOptions)
  /**
   * @deprecated Use the options form. Removed once every concrete wallet
   * migrates off positional providers/settings.
   */
  protected constructor(
    chainManager: ChainManager,
    lendProviders?: LendProviders,
    swapProviders?: SwapProviders,
    supportedAssets?: Asset[],
    swapSettings?: SwapSettings,
    borrowProviders?: BorrowProviders,
    borrowSettings?: BorrowSettings,
  )
  protected constructor(
    arg1: ChainManager | WalletConstructorOptions,
    lendProviders?: LendProviders,
    swapProviders?: SwapProviders,
    supportedAssets?: Asset[],
    swapSettings?: SwapSettings,
    borrowProviders?: BorrowProviders,
    borrowSettings?: BorrowSettings,
  ) {
    // Discriminate options-object from positional-chainManager by shape so
    // structural-equivalent test doubles (`MockChainManager`) still match
    // the positional path even though they don't extend `ChainManager`.
    const isOptions =
      typeof arg1 === 'object' &&
      arg1 !== null &&
      'chainManager' in (arg1 as object)
    const options: WalletConstructorOptions = isOptions
      ? (arg1 as WalletConstructorOptions)
      : {
          chainManager: arg1 as ChainManager,
          actionProviders: {
            lend: lendProviders,
            swap: swapProviders,
            borrow: borrowProviders,
          },
          actionSettings: {
            swap: swapSettings,
            borrow: borrowSettings,
          },
          supportedAssets,
        }

    this.chainManager = options.chainManager
    this.actionProviders = options.actionProviders ?? {}
    this.actionSettings = options.actionSettings ?? {}
    this.supportedAssets = options.supportedAssets ?? []

    const moduleDeps: ActionModuleDeps = {
      chainManager: this.chainManager,
      supportedAssets: this.supportedAssets,
    }

    for (const name of ACTION_NAMES) {
      // Generic narrowing across the loop requires per-step casting; the
      // discrimination over `ActionModules[K]` happens correctly inside each
      // module's own type. Confining the casts here keeps the wallet body
      // clean.
      const module = ACTION_MODULES[name] as unknown as ActionModule<ActionName>
      const providers = this.actionProviders[name]
      if (
        !providers ||
        !module.isConfigured(providers as never) ||
        !module.buildWalletNamespace
      ) {
        continue
      }
      const ns = (
        module.buildWalletNamespace as (
          p: unknown,
          w: Wallet,
          s: unknown,
          d: ActionModuleDeps,
        ) => unknown
      )(providers, this, this.actionSettings[name], moduleDeps)
      assignWalletNamespace(this, name, ns)
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
 * Assign a `WalletXNamespace` to its slot on a `Wallet` instance keyed by
 * the action name. TypeScript can't prove that `wallet[name]` accepts the
 * namespace type produced by `ACTION_MODULES[name].buildWalletNamespace`,
 * so this helper holds the one necessary cast. Adding a new action to
 * `ActionModules` only requires declaring the corresponding `name?: T`
 * field on `Wallet`; the assignment site stays generic.
 */
function assignWalletNamespace(
  wallet: Wallet,
  name: ActionName,
  ns: unknown,
): void {
  ;(wallet as unknown as Record<ActionName, unknown>)[name] = ns
}

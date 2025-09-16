import type { Address, LocalAccount, WalletClient } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { WalletLendNamespace } from '@/lend/namespaces/WalletLendNamespace.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { fetchETHBalance } from '@/services/tokenBalance.js'
import { SUPPORTED_TOKENS } from '@/supported/tokens.js'
import type { TokenBalance } from '@/types/token.js'

/**
 * Base verbs wallet class
 * @description Abstract base class for verbs wallet implementations.
 * Provides a standard interface for verbs wallets.
 */
export abstract class Wallet {
  /** Lend namespace with all lending operations */
  lend?: WalletLendNamespace
  /** Manages supported blockchain networks and RPC clients */
  protected chainManager: ChainManager
  /** Promise to initialize the wallet */
  private initPromise?: Promise<void>

  /**
   * Get the address of this verbs wallet
   * @description Returns the address of the verbs wallet.
   * @returns The address of the verbs wallet.
   */
  public abstract readonly address: Address
  /**
   * Get a signer for this verbs wallet
   * @description Returns a LocalAccount that can be used to sign transactions and messages.
   * This can be used as the signer for smart wallet operations if the signer is an
   * owner on the smart wallet.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   */
  public abstract readonly signer: LocalAccount

  /**
   * Create a new wallet
   * @param chainManager - Chain manager for the wallet
   */
  protected constructor(chainManager: ChainManager) {
    this.chainManager = chainManager
  }

  /**
   * Get asset balances across all supported chains
   * @description Fetches ETH and ERC20 token balances for this wallet across all supported networks.
   * @returns Promise resolving to array of token balances with chain breakdown
   */
  async getBalance(): Promise<TokenBalance[]> {
    // For now, just return ETH balance until assets are properly configured
    const ethBalancePromise = fetchETHBalance(this.chainManager, this.address)
    return Promise.all([ethBalancePromise])
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
   * Get a wallet client for this verbs wallet
   * @description Returns a WalletClient that can be used to send transactions and interact
   * with smart contracts.
   * @param chainId - The chain ID to create the wallet client for
   * @returns Promise resolving to a WalletClient configured for the specified chain
   */
  abstract walletClient(chainId: SupportedChainId): Promise<WalletClient>
}

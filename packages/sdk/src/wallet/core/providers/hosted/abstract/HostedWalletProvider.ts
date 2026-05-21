import type { LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type {
  ActionProvidersMap,
  ActionSettingsMap,
} from '@/types/actionRegistry.js'
import type { Asset } from '@/types/asset.js'
import type {
  BorrowProviders,
  LendProviders,
  SwapProviders,
} from '@/types/providers.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Options handed to `HostedWalletProvider` subclasses.
 * @description Action-keyed `actionProviders` / `actionSettings` are the
 * preferred shape; the legacy positional/named per-action params are kept
 * during the registry migration so existing subclasses still compile.
 */
export interface HostedWalletProviderOptions {
  chainManager: ChainManager
  actionProviders?: ActionProvidersMap
  actionSettings?: ActionSettingsMap
  supportedAssets?: Asset[]
}

/**
 * Base hosted wallet provider class
 * @description Abstract base class for hosted wallet provider implementations (Privy, Dynamic, etc.).
 * Provides a standard interface for creating and retrieving hosted wallets that can be used
 * as signers for smart wallets or standalone wallet functionality.
 */
export abstract class HostedWalletProvider<
  TType extends string,
  TOptionsMap extends Record<TType, unknown>,
> {
  protected chainManager: ChainManager
  protected actionProviders: ActionProvidersMap
  protected actionSettings: ActionSettingsMap
  protected supportedAssets?: Asset[]

  /** Legacy mirror. derived from `actionProviders.lend`. */
  protected get lendProviders(): LendProviders {
    return (this.actionProviders.lend ?? {}) as LendProviders
  }
  /** Legacy mirror. derived from `actionProviders.swap`. */
  protected get swapProviders(): SwapProviders {
    return (this.actionProviders.swap ?? {}) as SwapProviders
  }
  /** Legacy mirror. derived from `actionProviders.borrow`. */
  protected get borrowProviders(): BorrowProviders {
    return (this.actionProviders.borrow ?? {}) as BorrowProviders
  }

  protected constructor(options: HostedWalletProviderOptions)
  protected constructor(
    chainManager: ChainManager,
    lendProviders?: LendProviders,
    swapProviders?: SwapProviders,
    supportedAssets?: Asset[],
  )
  protected constructor(
    arg1: ChainManager | HostedWalletProviderOptions,
    lendProviders?: LendProviders,
    swapProviders?: SwapProviders,
    supportedAssets?: Asset[],
  ) {
    const isOptions =
      typeof arg1 === 'object' &&
      arg1 !== null &&
      'chainManager' in (arg1 as object)
    const options: HostedWalletProviderOptions = isOptions
      ? (arg1 as HostedWalletProviderOptions)
      : {
          chainManager: arg1 as ChainManager,
          actionProviders: {
            lend: lendProviders,
            swap: swapProviders,
          },
          supportedAssets,
        }
    this.chainManager = options.chainManager
    this.actionProviders = options.actionProviders ?? {}
    this.actionSettings = options.actionSettings ?? {}
    this.supportedAssets = options.supportedAssets
  }
  /**
   * Convert a hosted wallet to an Actions wallet
   * @description Converts a hosted wallet to an Actions wallet instance.
   * @param params - Parameters for converting a hosted wallet to an Actions wallet
   * @returns Promise resolving to the Actions wallet instance
   */
  abstract toActionsWallet(params: TOptionsMap[TType]): Promise<Wallet>

  /**
   * Create a viem LocalAccount signer from the hosted wallet
   * @description Produces a signing account backed by the hosted wallet without wrapping
   * it in a full Actions wallet. This is useful when you need to pass the signer
   * into an Actions smart wallet as a signer, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Configuration for the signer
   * @returns Promise resolving to a viem `LocalAccount` with the hosted wallet as the signer backend
   */
  abstract createSigner(params: TOptionsMap[TType]): Promise<LocalAccount>
}

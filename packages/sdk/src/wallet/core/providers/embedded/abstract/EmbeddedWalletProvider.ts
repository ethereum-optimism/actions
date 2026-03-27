import type { LocalAccount } from 'viem'

import type { LendProvider } from '@/lend/core/LendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { SwapProvider } from '@/swap/core/SwapProvider.js'
import type { LendProviderConfig, SwapProviderConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

/**
 * Base embedded wallet provider class
 * @description Abstract base class for embedded wallet provider implementations (Privy, Dynamic, etc.).
 * Provides a standard interface for creating and retrieving embedded wallets that can be used
 * as signers for smart wallets or standalone wallet functionality.
 */
export abstract class EmbeddedWalletProvider<
  TType extends string,
  TOptionsMap extends Record<TType, unknown>,
> {
  protected chainManager: ChainManager
  protected lendProviders: {
    morpho?: LendProvider<LendProviderConfig>
    aave?: LendProvider<LendProviderConfig>
  }
  protected swapProviders: {
    uniswap?: SwapProvider<SwapProviderConfig>
  }
  protected supportedAssets?: Asset[]

  protected constructor(
    chainManager: ChainManager,
    lendProviders?: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    },
    swapProviders?: {
      uniswap?: SwapProvider<SwapProviderConfig>
    },
    supportedAssets?: Asset[],
  ) {
    this.chainManager = chainManager
    this.lendProviders = lendProviders || {}
    this.swapProviders = swapProviders || {}
    this.supportedAssets = supportedAssets
  }
  /**
   * Convert a embedded wallet to an Actions wallet
   * @description Converts a embedded wallet to an Actions wallet instance.
   * @param params - Parameters for converting a embedded wallet to an Actions wallet
   * @returns Promise resolving to the Actions wallet instance
   */
  abstract toActionsWallet(params: TOptionsMap[TType]): Promise<Wallet>

  /**
   * Create a viem LocalAccount signer from the embedded wallet
   * @description Produces a signing account backed by the embedded wallet without wrapping
   * it in a full Actions wallet. This is useful when you need to pass the signer
   * into an Actions smart wallet as a signer, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Configuration for the signer
   * @returns Promise resolving to a viem `LocalAccount` with the embedded wallet as the signer backend
   */
  abstract createSigner(params: TOptionsMap[TType]): Promise<LocalAccount>
}

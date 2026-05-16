import type { LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import { EmbeddedWalletProvider } from '@/wallet/core/providers/embedded/abstract/EmbeddedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { ReactToActionsOptionsMap } from '@/wallet/react/providers/embedded/types/index.js'
import { DynamicWallet } from '@/wallet/react/wallets/embedded/dynamic/DynamicWallet.js'
import { createSigner } from '@/wallet/react/wallets/embedded/dynamic/utils/createSigner.js'

/**
 * Dynamic wallet provider implementation
 * @description Wallet provider implementation using Dynamic service
 */
export class DynamicEmbeddedWalletProvider extends EmbeddedWalletProvider<
  'dynamic',
  ReactToActionsOptionsMap
> {
  /**
   * Create a new Dynamic wallet provider
   * @param chainManager Chain manager for RPC, chain info, and transports
   * @param lendProviders Optional lend providers for DeFi operations
   * @param swapProviders Optional swap providers for trading operations
   */
  constructor(
    chainManager: ChainManager,
    lendProviders?: LendProviders,
    swapProviders?: SwapProviders,
    supportedAssets?: Asset[],
  ) {
    super(chainManager, lendProviders, swapProviders, supportedAssets)
  }

  async toActionsWallet(
    params: ReactToActionsOptionsMap['dynamic'],
  ): Promise<Wallet> {
    return DynamicWallet.create({
      dynamicWallet: params.wallet,
      chainManager: this.chainManager,
      lendProviders: this.lendProviders,
      swapProviders: this.swapProviders,
      supportedAssets: this.supportedAssets,
    })
  }

  /**
   * Create a viem LocalAccount signer from Dynamic credentials
   * @description Produces a signing account backed by Dynamic without wrapping
   * it in a full Actions wallet. This is useful when you need to pass the signer
   * into an Actions smart wallet as a signer, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Dynamic configuration for the signer
   * @param params.wallet - Dynamic wallet instance
   * @returns Promise resolving to a viem `LocalAccount` with Dynamic as the signer backend
   */
  async createSigner(
    params: ReactToActionsOptionsMap['dynamic'],
  ): Promise<LocalAccount> {
    return createSigner(params)
  }
}

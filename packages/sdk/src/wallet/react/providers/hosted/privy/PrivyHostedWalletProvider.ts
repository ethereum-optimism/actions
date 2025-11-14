import type { LocalAccount } from 'viem'

import type { LendProvider } from '@/lend/core/LendProvider.js'
import type { AaveLendProvider } from '@/lend/providers/aave/AaveLendProvider.js'
import type { MorphoLendProvider } from '@/lend/providers/morpho/MorphoLendProvider.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig } from '@/types/actions.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type { ReactToActionsOptionsMap } from '@/wallet/react/providers/hosted/types/index.js'
import { PrivyWallet } from '@/wallet/react/wallets/hosted/privy/PrivyWallet.js'
import { createSigner } from '@/wallet/react/wallets/hosted/privy/utils/createSigner.js'

/**
 * Privy hosted wallet provider (React)
 */
export class PrivyHostedWalletProvider extends HostedWalletProvider<
  'privy',
  ReactToActionsOptionsMap
> {
  /**
   * Create a new Privy wallet provider
   * @param chainManager Chain manager for RPC, chain info, and transports
   */
  constructor(
    chainManager: ChainManager,
    lendProviders?: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    },
  ) {
    super(chainManager, lendProviders)
  }

  async toActionsWallet(
    params: ReactToActionsOptionsMap['privy'],
  ): Promise<Wallet> {
    const { connectedWallet } = params
    const wallet = await PrivyWallet.create({
      chainManager: this.chainManager,
      connectedWallet,
      lendProviders: this.lendProviders,
    })
    return wallet
  }

  /**
   * Create a viem LocalAccount signer from Privy credentials
   * @description Produces a signing account backed by Privy without wrapping
   * it in a full Actions wallet. This is useful when you need to pass the signer
   * into an Actions smart wallet as a signer, for lower-level viem operations, or
   * for passing to other libraries that accept a viem `LocalAccount`.
   * @param params - Privy configuration for the signer
   * @param params.connectedWallet - Privy connected wallet
   * @returns Promise resolving to a viem `LocalAccount` with Privy as the signer backend
   */
  async createSigner(
    params: ReactToActionsOptionsMap['privy'],
  ): Promise<LocalAccount> {
    return createSigner(params)
  }
}

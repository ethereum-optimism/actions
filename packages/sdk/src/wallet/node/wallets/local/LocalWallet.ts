import type { Address, LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'

/**
 * Local wallet implementation
 * @description Wallet backed by a viem LocalAccount provided by the developer.
 * The SDK never handles raw private key material — the developer creates the
 * LocalAccount themselves (e.g. via privateKeyToAccount) and passes it in.
 */
export class LocalWallet extends EOAWallet {
  public readonly address: Address
  public readonly signer: LocalAccount

  private constructor(params: {
    account: LocalAccount
    chainManager: ChainManager
    lendProviders?: LendProviders
    swapProviders?: SwapProviders
    supportedAssets?: Asset[]
  }) {
    const {
      account,
      chainManager,
      lendProviders,
      swapProviders,
      supportedAssets,
    } = params
    super(chainManager, lendProviders, swapProviders, supportedAssets)
    this.signer = account
    this.address = account.address
  }

  static async create(params: {
    account: LocalAccount
    chainManager: ChainManager
    lendProviders?: LendProviders
    swapProviders?: SwapProviders
    supportedAssets?: Asset[]
  }): Promise<LocalWallet> {
    const wallet = new LocalWallet(params)
    await wallet.initialize()
    return wallet
  }
}

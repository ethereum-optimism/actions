import type { Address, LocalAccount } from 'viem'

import type { BaseWalletCreateOptions } from '@/wallet/core/wallets/abstract/Wallet.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'

interface LocalWalletCreateOptions extends BaseWalletCreateOptions {
  account: LocalAccount
}

/**
 * Local wallet implementation
 * @description Wallet backed by a viem LocalAccount provided by the developer.
 * The SDK never handles raw private key material — the developer creates the
 * LocalAccount themselves (e.g. via privateKeyToAccount) and passes it in.
 */
export class LocalWallet extends EOAWallet {
  public readonly address: Address
  public readonly signer: LocalAccount

  private constructor(params: LocalWalletCreateOptions) {
    const {
      account,
      chainManager,
      actionProviders,
      actionSettings,
      supportedAssets,
    } = params
    super({ chainManager, actionProviders, actionSettings, supportedAssets })
    this.signer = account
    this.address = account.address
  }

  static async create(params: LocalWalletCreateOptions): Promise<LocalWallet> {
    const wallet = new LocalWallet(params)
    await wallet.initialize()
    return wallet
  }
}

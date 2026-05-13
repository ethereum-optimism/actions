import type { Address, LocalAccount } from 'viem'

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
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'

interface LocalWalletCreateOptions {
  account: LocalAccount
  chainManager: ChainManager
  actionProviders?: ActionProvidersMap
  actionSettings?: ActionSettingsMap
  lendProviders?: LendProviders
  swapProviders?: SwapProviders
  borrowProviders?: BorrowProviders
  supportedAssets?: Asset[]
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
      lendProviders,
      swapProviders,
      borrowProviders,
      supportedAssets,
    } = params
    super({
      chainManager,
      actionProviders: actionProviders ?? {
        lend: lendProviders,
        swap: swapProviders,
        borrow: borrowProviders,
      },
      actionSettings,
      supportedAssets,
    })
    this.signer = account
    this.address = account.address
  }

  static async create(params: LocalWalletCreateOptions): Promise<LocalWallet> {
    const wallet = new LocalWallet(params)
    await wallet.initialize()
    return wallet
  }
}

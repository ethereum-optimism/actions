import { type Address, type LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type {
  ActionProvidersMap,
  ActionSettingsMap,
} from '@/types/actionRegistry.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'
import type { DynamicHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'
import { createSigner } from '@/wallet/react/wallets/hosted/dynamic/utils/createSigner.js'

interface DynamicWalletCreateOptions {
  chainManager: ChainManager
  dynamicWallet: DynamicHostedWalletToActionsWalletOptions['wallet']
  actionProviders?: ActionProvidersMap
  actionSettings?: ActionSettingsMap
  lendProviders?: LendProviders
  swapProviders?: SwapProviders
  supportedAssets?: Asset[]
}

/**
 * Dynamic wallet implementation
 * @description Wallet implementation using the Dynamic Labs wallet SDK.
 */
export class DynamicWallet extends EOAWallet {
  public signer!: LocalAccount
  public address!: Address
  private readonly dynamicWallet: DynamicHostedWalletToActionsWalletOptions['wallet']

  private constructor(params: DynamicWalletCreateOptions) {
    super({
      chainManager: params.chainManager,
      actionProviders: params.actionProviders ?? {
        lend: params.lendProviders,
        swap: params.swapProviders,
      },
      actionSettings: params.actionSettings,
      supportedAssets: params.supportedAssets,
    })
    this.dynamicWallet = params.dynamicWallet
  }

  static async create(
    params: DynamicWalletCreateOptions,
  ): Promise<DynamicWallet> {
    const wallet = new DynamicWallet(params)
    await wallet.initialize()
    return wallet
  }

  /**
   * Initialize the DynamicWallet by creating the signer account
   */
  protected async performInitialization() {
    this.signer = await this.createSigner()
    this.address = this.signer.address
  }

  /**
   * Create a LocalAccount from this Dynamic wallet
   * @description Converts the Dynamic wallet into a viem-compatible LocalAccount that can sign
   * messages and transactions. The returned account uses Dynamic's signing infrastructure
   * under the hood while providing a standard viem interface.
   * @returns Promise resolving to a LocalAccount configured for signing operations
   * @throws Error if wallet retrieval fails or signing operations are not supported
   */
  private async createSigner(): Promise<LocalAccount> {
    return createSigner({
      wallet: this.dynamicWallet,
    })
  }
}

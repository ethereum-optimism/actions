import type { TurnkeySDKClientBase } from '@turnkey/core'
import type { TurnkeyClient } from '@turnkey/http'
import type { TurnkeyServerClient } from '@turnkey/sdk-server'
import type { Address, LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type {
  ActionProvidersMap,
  ActionSettingsMap,
} from '@/types/actionRegistry.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'
import { createSigner } from '@/wallet/node/wallets/hosted/turnkey/utils/createSigner.js'

interface TurnkeyWalletCreateOptions {
  chainManager: ChainManager
  client: TurnkeyClient | TurnkeyServerClient | TurnkeySDKClientBase
  organizationId: string
  signWith: string
  ethereumAddress?: string
  actionProviders?: ActionProvidersMap
  actionSettings?: ActionSettingsMap
  lendProviders?: LendProviders
  swapProviders?: SwapProviders
  supportedAssets?: Asset[]
}

/**
 * Turnkey wallet implementation
 * @description Wallet implementation using Turnkey service
 */
export class TurnkeyWallet extends EOAWallet {
  public address!: Address
  public signer!: LocalAccount
  private readonly client:
    | TurnkeyClient
    | TurnkeyServerClient
    | TurnkeySDKClientBase
  private readonly organizationId: string
  private readonly signWith: string
  private readonly ethereumAddress?: string

  private constructor(params: TurnkeyWalletCreateOptions) {
    super({
      chainManager: params.chainManager,
      actionProviders: params.actionProviders ?? {
        lend: params.lendProviders,
        swap: params.swapProviders,
      },
      actionSettings: params.actionSettings,
      supportedAssets: params.supportedAssets,
    })
    this.client = params.client
    this.organizationId = params.organizationId
    this.signWith = params.signWith
    this.ethereumAddress = params.ethereumAddress
  }

  static async create(
    params: TurnkeyWalletCreateOptions,
  ): Promise<TurnkeyWallet> {
    const wallet = new TurnkeyWallet(params)
    await wallet.initialize()
    return wallet
  }

  protected async performInitialization() {
    this.signer = await this.createSigner()
    this.address = this.signer.address
  }

  private async createSigner(): Promise<LocalAccount> {
    return createSigner({
      client: this.client,
      organizationId: this.organizationId,
      signWith: this.signWith,
      ethereumAddress: this.ethereumAddress,
    })
  }
}

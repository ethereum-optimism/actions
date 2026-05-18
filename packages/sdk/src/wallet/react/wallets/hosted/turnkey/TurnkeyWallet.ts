import type { TurnkeySDKClientBase } from '@turnkey/react-wallet-kit'
import type { Address, LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type {
  ActionProvidersMap,
  ActionSettingsMap,
} from '@/types/actionRegistry.js'
import type { Asset } from '@/types/asset.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'
import { createSigner } from '@/wallet/react/wallets/hosted/turnkey/utils/createSigner.js'

interface TurnkeyWalletCreateOptions {
  chainManager: ChainManager
  client: TurnkeySDKClientBase
  organizationId: string
  signWith: string
  ethereumAddress?: string
  actionProviders?: ActionProvidersMap
  actionSettings?: ActionSettingsMap
  supportedAssets?: Asset[]
}

/**
 * Turnkey wallet implementation
 * @description Wallet implementation using Turnkey service
 */
export class TurnkeyWallet extends EOAWallet {
  public address!: Address
  public signer!: LocalAccount
  private readonly client: TurnkeySDKClientBase
  private readonly organizationId: string
  private readonly signWith: string
  private readonly ethereumAddress?: string

  private constructor(params: TurnkeyWalletCreateOptions) {
    super({
      chainManager: params.chainManager,
      actionProviders: params.actionProviders,
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

  /**
   * Create a viem LocalAccount instance backed by Turnkey
   * @description Wraps the Turnkey SDK's `createAccount` to produce a signing
   * account compatible with viem. Under the hood, this uses the provided
   * `client`, `organizationId`, and `signWith` to authenticate signing requests
   * with Turnkey. If `ethereumAddress` is supplied, it's used directly;
   * otherwise the SDK fetches it from the Turnkey API.
   * @returns Promise resolving to a viem `LocalAccount` with Turnkey as the signer backend
   */
  private async createSigner(): Promise<LocalAccount> {
    return createSigner({
      client: this.client,
      organizationId: this.organizationId,
      signWith: this.signWith,
      ethereumAddress: this.ethereumAddress,
    })
  }
}

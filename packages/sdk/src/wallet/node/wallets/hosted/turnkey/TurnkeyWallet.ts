import type { TurnkeySDKClientBase } from '@turnkey/core'
import type { TurnkeyClient } from '@turnkey/http'
import type { TurnkeyServerClient } from '@turnkey/sdk-server'
import type { Address, LocalAccount } from 'viem'

import type { BaseWalletCreateOptions } from '@/wallet/core/wallets/abstract/Wallet.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'
import { createSigner } from '@/wallet/node/wallets/hosted/turnkey/utils/createSigner.js'

interface TurnkeyWalletCreateOptions extends BaseWalletCreateOptions {
  client: TurnkeyClient | TurnkeyServerClient | TurnkeySDKClientBase
  organizationId: string
  signWith: string
  ethereumAddress?: string
}

/**
 * Turnkey wallet implementation
 * @description Wallet implementation using Turnkey service
 */
export class TurnkeyWallet extends EOAWallet {
  public address!: Address
  public signer!: LocalAccount
  /**
   * Turnkey client instance (HTTP, server, or core SDK base)
   */
  private readonly client:
    | TurnkeyClient
    | TurnkeyServerClient
    | TurnkeySDKClientBase
  /**
   * Turnkey organization ID that owns the signing key
   */
  private readonly organizationId: string
  /**
   * This can be a wallet account address, private key address, or private key ID.
   */
  private readonly signWith: string
  /**
   * Ethereum address to use for this account, in the case that a private key ID is used to sign.
   * If left undefined, `createAccount` will fetch it from the Turnkey API.
   * We recommend setting this if you're using a passkey client, so that your users are not prompted for a passkey signature just to fetch their address.
   * You may leave this undefined if using an API key client.
   */
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

  private async createSigner(): Promise<LocalAccount> {
    return createSigner({
      client: this.client,
      organizationId: this.organizationId,
      signWith: this.signWith,
      ethereumAddress: this.ethereumAddress,
    })
  }
}

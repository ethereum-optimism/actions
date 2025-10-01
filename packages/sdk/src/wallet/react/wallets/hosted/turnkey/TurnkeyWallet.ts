import type { TurnkeySDKClientBase } from '@turnkey/react-wallet-kit'
import type { Address, LocalAccount, WalletClient } from 'viem'
import { createWalletClient, fallback, http } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import { createSigner } from '@/wallet/react/wallets/hosted/turnkey/utils/createSigner.js'

/**
 * Turnkey wallet implementation
 * @description Wallet implementation using Turnkey service
 */
export class TurnkeyWallet extends Wallet {
  public address!: Address
  public signer!: LocalAccount
  /**
   * Turnkey client instance
   */
  private readonly client: TurnkeySDKClientBase
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
   * If left undefined, `createSigner` will fetch it from the Turnkey API.
   * We recommend setting this if you're using a passkey client, so that your users are not prompted for a passkey signature just to fetch their address.
   * You may leave this undefined if using an API key client.
   */
  private readonly ethereumAddress?: string

  private constructor(params: {
    chainManager: ChainManager
    client: TurnkeySDKClientBase
    organizationId: string
    signWith: string
    ethereumAddress?: string
  }) {
    const { chainManager, client, organizationId, signWith, ethereumAddress } =
      params
    super(chainManager)
    this.client = client
    this.organizationId = organizationId
    this.signWith = signWith
    this.ethereumAddress = ethereumAddress
  }

  static async create(params: {
    chainManager: ChainManager
    client: TurnkeySDKClientBase
    organizationId: string
    signWith: string
    ethereumAddress?: string
  }): Promise<TurnkeyWallet> {
    const wallet = new TurnkeyWallet(params)
    await wallet.initialize()
    return wallet
  }

  async walletClient(chainId: SupportedChainId): Promise<WalletClient> {
    const rpcUrls = this.chainManager.getRpcUrls(chainId)
    return createWalletClient({
      account: this.signer,
      chain: this.chainManager.getChain(chainId),
      transport: rpcUrls?.length
        ? fallback(rpcUrls.map((rpcUrl) => http(rpcUrl)))
        : http(),
    })
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

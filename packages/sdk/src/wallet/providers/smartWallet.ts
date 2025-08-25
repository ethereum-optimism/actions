import type { Address, LocalAccount } from 'viem'
import { pad } from 'viem'
import { type WebAuthnAccount } from 'viem/account-abstraction'

import { smartWalletFactoryAbi } from '@/abis/smartWalletFactory.js'
import { smartWalletFactoryAddress } from '@/constants/addresses.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import { SmartWallet } from '@/wallet/SmartWallet.js'

export class SmartWalletProvider {
  private chainManager: ChainManager
  private paymasterAndBundlerUrl: string
  private lendProvider: LendProvider

  constructor(
    chainManager: ChainManager,
    paymasterAndBundlerUrl: string,
    lendProvider: LendProvider,
  ) {
    this.chainManager = chainManager
    this.paymasterAndBundlerUrl = paymasterAndBundlerUrl
    this.lendProvider = lendProvider
  }

  async createWallet(
    owners: Array<Address | WebAuthnAccount>,
    signer: LocalAccount,
    nonce?: bigint,
  ): Promise<SmartWallet> {
    return new SmartWallet(
      owners,
      signer,
      this.chainManager,
      this.lendProvider,
      this.paymasterAndBundlerUrl,
      undefined,
      undefined,
      nonce,
    )
  }

  async getSmartWalletAddress(params: {
    owners: Array<Address | WebAuthnAccount>
    nonce?: bigint
  }) {
    const { owners, nonce = 0n } = params
    const owners_bytes = owners.map((owner) => {
      if (typeof owner === 'string') return pad(owner)
      if (owner.type === 'webAuthn') return owner.publicKey
      throw new Error('invalid owner type')
    })

    // Factory is the same accross all chains, so we can use the first chain to get the wallet address
    const publicClient = this.chainManager.getPublicClient(
      this.chainManager.getSupportedChains()[0],
    )
    const smartWalletAddress = await publicClient.readContract({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [owners_bytes, nonce],
    })
    return smartWalletAddress
  }

  /**
   * Get an existing smart wallet instance
   * @description Creates a SmartWallet instance for an already deployed wallet.
   * Use this when you know the wallet address and want to interact with it.
   * @param params.walletAddress - Address of the deployed smart wallet
   * @param params.signer - Local account used for signing transactions
   * @param params.ownerIndex - Index of the signer in the wallet's owner list (defaults to 0)
   * @returns SmartWallet instance
   */
  getWallet(params: {
    walletAddress: Address
    signer: LocalAccount
    ownerIndex?: number
  }): SmartWallet {
    const { walletAddress, signer, ownerIndex } = params
    return new SmartWallet(
      [signer.address],
      signer,
      this.chainManager,
      this.lendProvider,
      this.paymasterAndBundlerUrl,
      walletAddress,
      ownerIndex,
    )
  }
}

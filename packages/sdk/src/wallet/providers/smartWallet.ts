import type { Address } from 'viem'
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
    nonce?: bigint,
  ): Promise<SmartWallet> {
    return new SmartWallet(
      owners,
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

  async getWallet(params: {
    walletAddress: Address
    owner: Address | WebAuthnAccount
    ownerIndex?: number
    nonce?: bigint
  }): Promise<SmartWallet> {
    const { walletAddress, owner, ownerIndex, nonce } = params
    return new SmartWallet(
      [owner],
      this.chainManager,
      this.lendProvider,
      this.paymasterAndBundlerUrl,
      walletAddress,
      ownerIndex,
      nonce,
    )
  }
}

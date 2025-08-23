import { chainById } from '@eth-optimism/viem/chains'
import type { Address, Hash } from 'viem'
import {
  createWalletClient,
  encodeAbiParameters,
  http,
  parseEventLogs,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { smartWalletFactoryAbi } from '@/abis/smartWalletFactory.js'
import { smartWalletFactoryAddress } from '@/constants/addresses.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import { SmartWallet } from '@/wallet/SmartWallet.js'
import { toCoinbaseSmartAccount } from 'viem/account-abstraction'
import { SupportedChainId } from '@/constants/supportedChains.js'

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
    ownerAddresses: Address[],
    bundlerUrl: string,
    nonce?: bigint,
  ): Promise<SmartWallet> {
    // deploy the wallet on each chain in the chain manager
    const deployments = await Promise.all(
      this.chainManager.getSupportedChains().map(async (chainId) => {
        const publicClient = this.chainManager.getPublicClient(chainId)
         const smartAccount = await toCoinbaseSmartAccount({
          client: publicClient,
          owners: ownerAddresses,
          nonce,
          // viem only supports the factory deployed by cb. if we wanted
          // our own factory at some point we would need to work with them
          // to update this to allow for other factories
          version: '1.1',
         })
         return smartAccount
      }),
    )
    return new SmartWallet(
      deployments[0].address,
      ownerAddresses,
      this.chainManager,
      this.lendProvider,
      bundlerUrl,
    )
  }

  async getWallet(
    initialOwnerAddresses: Address[],
    bundlerUrl: string,
    nonce?: bigint,
    currentOwnerAddresses?: Address[],
  ): Promise<SmartWallet> {
    // Factory is the same accross all chains, so we can use the first chain to get the wallet address
    const publicClient = this.chainManager.getPublicClient(
      this.chainManager.getSupportedChains()[0],
    )
    const encodedOwners = initialOwnerAddresses.map((ownerAddress) =>
      encodeAbiParameters([{ type: 'address' }], [ownerAddress]),
    )
    const smartWalletAddress = await publicClient.readContract({
      abi: smartWalletFactoryAbi,
      address: smartWalletFactoryAddress,
      functionName: 'getAddress',
      args: [encodedOwners, nonce || 0n],
    })
    const owners = currentOwnerAddresses || initialOwnerAddresses
    return new SmartWallet(
      smartWalletAddress,
      owners,
      this.chainManager,
      this.lendProvider,
      bundlerUrl,
    )
  }
}

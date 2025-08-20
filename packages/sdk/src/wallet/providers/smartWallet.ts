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
import type { WalletInterface } from '@/index.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import { SmartWallet } from '@/wallet/SmartWallet.js'

export class SmartWalletProvider {
  private chainManager: ChainManager
  private deployerPrivateKey: Hash
  private lendProvider: LendProvider

  constructor(
    chainManager: ChainManager,
    deployerPrivateKey: Hash,
    lendProvider: LendProvider,
  ) {
    this.chainManager = chainManager
    this.deployerPrivateKey = deployerPrivateKey
    this.lendProvider = lendProvider
  }

  async createWallet(
    ownerAddresses: Address[],
    nonce?: bigint,
  ): Promise<Array<{ chainId: number; address: Address }>> {
    // deploy the wallet on each chain in the chain manager
    const deployments = await Promise.all(
      this.chainManager.getSupportedChains().map(async (chainId) => {
        const walletClient = createWalletClient({
          chain: chainById[chainId],
          transport: http(this.chainManager.getRpcUrl(chainId)),
          account: privateKeyToAccount(this.deployerPrivateKey),
        })
        const encodedOwners = ownerAddresses.map((ownerAddress) =>
          encodeAbiParameters([{ type: 'address' }], [ownerAddress]),
        )
        const tx = await walletClient.writeContract({
          abi: smartWalletFactoryAbi,
          address: smartWalletFactoryAddress,
          functionName: 'createAccount',
          args: [encodedOwners, nonce || 0n],
        })
        const publicClient = this.chainManager.getPublicClient(chainId)
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: tx,
        })
        if (!receipt.status) {
          throw new Error('Wallet deployment failed')
        }
        // parse logs
        const logs = parseEventLogs({
          abi: smartWalletFactoryAbi,
          eventName: 'AccountCreated',
          logs: receipt.logs,
        })
        return {
          chainId,
          address: logs[0].args.account,
        }
      }),
    )
    return deployments
  }

  async getWallet(
    initialOwnerAddresses: Address[],
    nonce?: bigint,
    currentOwnerAddresses?: Address[],
  ): Promise<WalletInterface> {
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
    )
  }
}

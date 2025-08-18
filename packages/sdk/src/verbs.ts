import { chainById } from '@eth-optimism/viem/chains'
import type { Address, Hash, PublicClient } from 'viem'
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  parseEventLogs,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { mainnet, unichain } from 'viem/chains'

import { smartWalletFactoryAbi } from '@/abis/smartWalletFactory.js'
import { smartWalletFactoryAddress } from '@/constants/addresses.js'
import { LendProviderMorpho } from '@/lend/index.js'
import { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import type { VerbsConfig, VerbsInterface } from '@/types/verbs.js'
import type { Wallet as WalletInterface } from '@/types/wallet.js'
import { Wallet } from '@/wallet/index.js'

/**
 * Main Verbs SDK class
 * @description Core implementation of the Verbs SDK
 */
export class Verbs implements VerbsInterface {
  private _chainManager: ChainManager
  private lendProvider?: LendProvider
  private privateKey?: Hash

  constructor(config: VerbsConfig) {
    this._chainManager = new ChainManager(
      config.chains || [
        {
          chainId: unichain.id,
          rpcUrl: unichain.rpcUrls.default.http[0],
        },
      ],
    )
    this.privateKey = config.privateKey
    // Create lending provider if configured
    if (config.lend) {
      // TODO: delete this code and just have the lend use the ChainManager
      const configChain = config.chains?.[0]
      const chainId = configChain?.chainId || 130 // Default to Unichain
      const chain = chainId === 130 ? unichain : mainnet
      const publicClient = createPublicClient({
        chain,
        transport: http(
          configChain?.rpcUrl || unichain.rpcUrls.default.http[0],
        ),
      }) as PublicClient
      if (config.lend.type === 'morpho') {
        this.lendProvider = new LendProviderMorpho(config.lend, publicClient)
      } else {
        throw new Error(
          `Unsupported lending provider type: ${config.lend.type}`,
        )
      }
    }
  }

  async createWallet(
    ownerAddresses: Address[],
    nonce?: bigint,
  ): Promise<Array<{ chainId: number; address: Address }>> {
    // deploy the wallet on each chain in the chain manager
    const deployments = await Promise.all(
      this._chainManager.getSupportedChains().map(async (chainId) => {
        const walletClient = createWalletClient({
          chain: chainById[chainId],
          transport: http(this._chainManager.getRpcUrl(chainId)),
          account: privateKeyToAccount(this.privateKey!),
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
        const publicClient = this._chainManager.getPublicClient(chainId)
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
    const publicClient = this._chainManager.getPublicClient(
      this._chainManager.getSupportedChains()[0],
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
    return new Wallet(
      smartWalletAddress,
      owners,
      this._chainManager,
      this.lendProvider!,
    )
  }

  /**
   * Get the lend provider instance
   * @returns LendProvider instance if configured, undefined otherwise
   */
  get lend(): LendProvider {
    if (!this.lendProvider) {
      throw new Error('Lend provider not configured')
    }
    return this.lendProvider
  }

  /**
   * Get the chain manager instance
   * @returns ChainManager instance for multi-chain operations
   */
  get chainManager(): ChainManager {
    return this._chainManager
  }
}

/**
 * Initialize Verbs SDK
 * @description Factory function to create a new Verbs SDK instance
 * @param config - SDK configuration
 * @returns Initialized Verbs SDK instance
 */
export function initVerbs(config: VerbsConfig): VerbsInterface {
  return new Verbs(config)
}

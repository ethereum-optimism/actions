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
  ): Promise<SmartWallet> {
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
    return new SmartWallet(
      deployments[0].address,
      ownerAddresses,
      this.chainManager,
      this.lendProvider,
    )
  }

  async getWallet(
    eoaAddress: Address
  ): Promise<SmartWallet> {
    return new SmartWallet(
      eoaAddress,
      [eoaAddress],
      this.chainManager,
      this.lendProvider,
    )
  }
}

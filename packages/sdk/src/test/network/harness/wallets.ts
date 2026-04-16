import type { Address, LocalAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ChainManager } from '@/services/ChainManager.js'
import { ANVIL_ACCOUNTS } from '@/utils/test.js'
import { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'

import type { AnvilFork } from './forks.js'

/**
 * Concrete EOAWallet subclass for network tests.
 *
 * Extends the real SDK wallet hierarchy so namespace tests exercise the same
 * send/sendBatch/walletClient code paths that production wallets use.
 */
export class TestEOAWallet extends EOAWallet {
  public readonly address: Address
  public readonly signer: LocalAccount

  constructor(
    chainManager: ChainManager,
    privateKey: `0x${string}` = ANVIL_ACCOUNTS.ACCOUNT_0,
  ) {
    super(chainManager)
    this.signer = privateKeyToAccount(privateKey)
    this.address = this.signer.address
  }

  static async create(
    chainManager: ChainManager,
    privateKey: `0x${string}` = ANVIL_ACCOUNTS.ACCOUNT_0,
  ): Promise<TestEOAWallet> {
    const wallet = new TestEOAWallet(chainManager, privateKey)
    await wallet.initialize()
    return wallet
  }
}

/**
 * Create a ChainManager backed by Anvil fork RPC URLs.
 */
export function createForkChainManager(
  forks: Map<SupportedChainId, AnvilFork>,
): ChainManager {
  const chainConfigs = Array.from(forks.entries()).map(([chainId, fork]) => ({
    chainId,
    rpcUrls: [fork.rpcUrl],
  }))
  return new ChainManager(chainConfigs)
}

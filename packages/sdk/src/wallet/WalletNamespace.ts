import type { Hash } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProvider } from '@/types/lend.js'
import { PrivyWalletProvider } from '@/wallet/providers/privy.js'
import { SmartWalletProvider } from '@/wallet/providers/smartWallet.js'

// Wallet namespace that holds all providers
export class WalletNamespace {
  public privy?: PrivyWalletProvider
  public smartWallet?: SmartWalletProvider

  withPrivy(appId: string, appSecret: string, chainManager: ChainManager) {
    this.privy = new PrivyWalletProvider(appId, appSecret, chainManager)
    return this
  }

  withSmartWallet(
    chainManager: ChainManager,
    deployerPrivateKey: Hash,
    lendProvider: LendProvider,
  ) {
    this.smartWallet = new SmartWalletProvider(
      chainManager,
      deployerPrivateKey,
      lendProvider,
    )
    return this
  }
}

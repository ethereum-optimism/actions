import type { LocalAccount } from 'viem'

import type { ChainManager } from '@/services/ChainManager.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviders, SwapProviders } from '@/types/providers.js'
import { HostedWalletProvider } from '@/wallet/core/providers/hosted/abstract/HostedWalletProvider.js'
import type { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'
import type {
  LocalWalletToActionsWalletOptions,
  NodeToActionsOptionsMap,
} from '@/wallet/node/providers/hosted/types/index.js'
import { LocalWallet } from '@/wallet/node/wallets/local/LocalWallet.js'

/**
 * Local wallet provider
 * @description Thin provider for the 'local' registry entry. Wraps a viem
 * LocalAccount (provided by the caller) into a LocalWallet. The SDK never
 * handles raw private key material.
 */
export class LocalWalletProvider extends HostedWalletProvider<
  'local',
  NodeToActionsOptionsMap
> {
  constructor(params: {
    chainManager: ChainManager
    lendProviders?: LendProviders
    swapProviders?: SwapProviders
    supportedAssets?: Asset[]
  }) {
    super(
      params.chainManager,
      params.lendProviders,
      params.swapProviders,
      params.supportedAssets,
    )
  }

  async toActionsWallet(
    params: LocalWalletToActionsWalletOptions,
  ): Promise<Wallet> {
    return LocalWallet.create({
      account: params.account,
      chainManager: this.chainManager,
      lendProviders: this.lendProviders,
      swapProviders: this.swapProviders,
      supportedAssets: this.supportedAssets,
    })
  }

  async createSigner(
    params: NodeToActionsOptionsMap['local'],
  ): Promise<LocalAccount> {
    return params.account
  }
}

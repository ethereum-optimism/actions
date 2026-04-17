import type { Address, LocalAccount, WalletClient } from 'viem'

import type { LendProvider } from '@/actions/lend/core/LendProvider.js'
import type { SwapProvider } from '@/actions/swap/core/SwapProvider.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
import type { LendProviderConfig, SwapProviderConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type { TransactionData } from '@/types/lend/index.js'
import type { EOATransactionReceipt } from '@/wallet/core/wallets/abstract/types/index.js'
import { Wallet } from '@/wallet/core/wallets/abstract/Wallet.js'

export class TestWallet extends Wallet {
  public readonly address: Address
  public readonly signer: LocalAccount

  constructor(
    chainManager: ChainManager,
    address: Address,
    signer: LocalAccount,
    lendProviders?: {
      morpho?: LendProvider<LendProviderConfig>
      aave?: LendProvider<LendProviderConfig>
    },
    swapProviders?: {
      uniswap?: SwapProvider<SwapProviderConfig>
    },
    supportedAssets?: Asset[],
  ) {
    super(chainManager, lendProviders, swapProviders, supportedAssets)
    this.address = address
    this.signer = signer
  }

  async walletClient(_chainId: SupportedChainId): Promise<WalletClient> {
    return {} as unknown as WalletClient
  }

  async send(
    _transactionData: TransactionData,
    _chainId: SupportedChainId,
  ): Promise<EOATransactionReceipt> {
    return {} as unknown as EOATransactionReceipt
  }

  async sendBatch(
    _transactionData: readonly TransactionData[],
    _chainId: SupportedChainId,
  ): Promise<EOATransactionReceipt[]> {
    return [] as unknown as EOATransactionReceipt[]
  }
}

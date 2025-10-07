import type { Address, LocalAccount, WalletClient } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { ChainManager } from '@/services/ChainManager.js'
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
  ) {
    super(chainManager)
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
    _transactionData: TransactionData[],
    _chainId: SupportedChainId,
  ): Promise<EOATransactionReceipt[]> {
    return [] as unknown as EOATransactionReceipt[]
  }
}

import type { Address, LocalAccount, WalletClient } from 'viem'
import { vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { TransactionData } from '@/types/lend/index.js'
import type { EOATransactionReceipt } from '@/wallet/core/wallets/abstract/types/index.js'
import type { EOAWallet } from '@/wallet/core/wallets/eoa/EOAWallet.js'

export type CreateEOAWalletMockOptions = {
  /** Mock wallet address */
  address?: Address
  /** Mock signer */
  signer?: LocalAccount
  /** Custom implementation for walletClient */
  walletClientImpl?: (chainId: SupportedChainId) => Promise<WalletClient>
  /** Custom implementation for send */
  sendImpl?: (
    transactionData: TransactionData,
    chainId: SupportedChainId,
  ) => Promise<EOATransactionReceipt>
  /** Custom implementation for sendBatch */
  sendBatchImpl?: (
    transactionData: TransactionData[],
    chainId: SupportedChainId,
  ) => Promise<EOATransactionReceipt[]>
  /** Optional custom sendTokens implementation */
  sendTokensImpl?: (
    amount: number,
    asset: Asset,
    chainId: SupportedChainId,
    recipientAddress: Address,
  ) => Promise<TransactionData>
}

/**
 * Create a mock EOAWallet instance
 * @description Returns an object typed as `EOAWallet` with configurable
 * implementations for `send`, `sendBatch`, and `walletClient`. Other abstract
 * members are provided with minimal defaults or throw if invoked (unless overridden).
 */
export function createMock(
  options: CreateEOAWalletMockOptions = {},
): EOAWallet {
  const defaultReceipt = {
    transactionHash:
      '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    blockNumber: 12345n,
    status: 'success',
  } as unknown as EOATransactionReceipt

  const address: Address = (options.address ??
    '0x0000000000000000000000000000000000000000') as Address
  const signer: LocalAccount =
    options.signer ?? ({ address, type: 'local' } as unknown as LocalAccount)

  const walletClient = vi.fn(
    async (chainId: SupportedChainId): Promise<WalletClient> => {
      if (options.walletClientImpl) return options.walletClientImpl(chainId)
      throw new Error('walletClient not implemented in EOAWallet mock')
    },
  )

  const send = vi.fn(
    async (
      transactionData: TransactionData,
      chainId: SupportedChainId,
    ): Promise<EOATransactionReceipt> => {
      if (options.sendImpl) return options.sendImpl(transactionData, chainId)
      return defaultReceipt
    },
  )

  const sendBatch = vi.fn(
    async (
      transactionData: TransactionData[],
      chainId: SupportedChainId,
    ): Promise<EOATransactionReceipt[]> => {
      if (options.sendBatchImpl)
        return options.sendBatchImpl(transactionData, chainId)
      return [defaultReceipt]
    },
  )

  const sendTokens = vi.fn(
    async (
      amount: number,
      asset: Asset,
      chainId: SupportedChainId,
      recipientAddress: Address,
    ): Promise<TransactionData> => {
      if (options.sendTokensImpl)
        return options.sendTokensImpl(amount, asset, chainId, recipientAddress)
      throw new Error('sendTokens not implemented in EOAWallet mock')
    },
  )

  const mock = {
    get address() {
      return address
    },
    get signer() {
      return signer
    },
    walletClient,
    send,
    sendBatch,
    sendTokens,
  } as unknown as EOAWallet

  return mock
}

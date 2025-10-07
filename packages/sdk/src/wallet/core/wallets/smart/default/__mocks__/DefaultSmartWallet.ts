import type { Address, LocalAccount, WalletClient } from 'viem'
import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'
import { vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { TransactionData } from '@/types/lend/index.js'
import type { Signer } from '@/wallet/core/wallets/smart/abstract/types/index.js'
import type { DefaultSmartWallet } from '@/wallet/core/wallets/smart/default/DefaultSmartWallet.js'

export type CreateDefaultSmartWalletMockOptions = {
  /** Mock wallet address */
  address?: Address
  /** Mock signer */
  signer?: LocalAccount
  /** Custom implementation for deploy */
  deployImpl?: (chainId: SupportedChainId) => Promise<{
    chainId: SupportedChainId
    success: boolean
    receipt?: WaitForUserOperationReceiptReturnType
  }>
  /** Custom implementation for addSigner */
  addSignerImpl?: (signer: Signer, chainId: SupportedChainId) => Promise<number>
  /** Custom implementation for findSignerIndex */
  findSignerIndexImpl?: (
    signer: Signer,
    chainId: SupportedChainId,
  ) => Promise<number>
  /** Custom implementation for removeSigner */
  removeSignerImpl?: (
    signer: Signer,
    chainId: SupportedChainId,
    signerIndex?: number,
  ) => Promise<WaitForUserOperationReceiptReturnType>
  /** Custom implementation for send */
  sendImpl?: (
    transactionData: TransactionData,
    chainId: SupportedChainId,
  ) => Promise<WaitForUserOperationReceiptReturnType>
  /** Custom implementation for sendBatch */
  sendBatchImpl?: (
    transactionData: TransactionData[],
    chainId: SupportedChainId,
  ) => Promise<WaitForUserOperationReceiptReturnType>
  /** Optional custom walletClient implementation */
  walletClientImpl?: (chainId: SupportedChainId) => Promise<WalletClient>
  /** Optional custom sendTokens implementation */
  sendTokensImpl?: (
    amount: number,
    asset: Asset,
    chainId: SupportedChainId,
    recipientAddress: Address,
  ) => Promise<TransactionData>
}

/**
 * Create a mock DefaultSmartWallet instance
 * @description Returns an object typed as `DefaultSmartWallet` with configurable
 * implementations for all methods. Each method is wrapped with `vi.fn()` for spying.
 */
export function createMock(
  options: CreateDefaultSmartWalletMockOptions = {},
): DefaultSmartWallet {
  const defaultReceipt = {
    success: true,
  } as unknown as WaitForUserOperationReceiptReturnType

  const address: Address = (options.address ??
    '0x0000000000000000000000000000000000000000') as Address
  const signer: LocalAccount =
    options.signer ?? ({ address, type: 'local' } as unknown as LocalAccount)

  const deploy = vi.fn(
    async (
      chainId: SupportedChainId,
    ): Promise<{
      chainId: SupportedChainId
      success: boolean
      receipt?: WaitForUserOperationReceiptReturnType
    }> => {
      if (options.deployImpl) return options.deployImpl(chainId)
      return { chainId, success: true, receipt: undefined }
    },
  )

  const addSigner = vi.fn(
    async (signer: Signer, chainId: SupportedChainId): Promise<number> => {
      if (options.addSignerImpl) return options.addSignerImpl(signer, chainId)
      return 0
    },
  )

  const findSignerIndex = vi.fn(
    async (signer: Signer, chainId: SupportedChainId): Promise<number> => {
      if (options.findSignerIndexImpl)
        return options.findSignerIndexImpl(signer, chainId)
      return -1
    },
  )

  const removeSigner = vi.fn(
    async (
      signer: Signer,
      chainId: SupportedChainId,
      signerIndex?: number,
    ): Promise<WaitForUserOperationReceiptReturnType> => {
      if (options.removeSignerImpl)
        return options.removeSignerImpl(signer, chainId, signerIndex)
      return defaultReceipt
    },
  )

  const send = vi.fn(
    async (
      transactionData: TransactionData,
      chainId: SupportedChainId,
    ): Promise<WaitForUserOperationReceiptReturnType> => {
      if (options.sendImpl) return options.sendImpl(transactionData, chainId)
      return defaultReceipt
    },
  )

  const sendBatch = vi.fn(
    async (
      transactionData: TransactionData[],
      chainId: SupportedChainId,
    ): Promise<WaitForUserOperationReceiptReturnType> => {
      if (options.sendBatchImpl)
        return options.sendBatchImpl(transactionData, chainId)
      return defaultReceipt
    },
  )

  const walletClient = vi.fn(
    async (chainId: SupportedChainId): Promise<WalletClient> => {
      if (options.walletClientImpl) return options.walletClientImpl(chainId)
      throw new Error('walletClient not implemented in DefaultSmartWallet mock')
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
      throw new Error('sendTokens not implemented in DefaultSmartWallet mock')
    },
  )

  const mock = {
    get address() {
      return address
    },
    get signer() {
      return signer
    },
    deploy,
    addSigner,
    findSignerIndex,
    removeSigner,
    walletClient,
    send,
    sendBatch,
    sendTokens,
  } as unknown as DefaultSmartWallet

  return mock
}

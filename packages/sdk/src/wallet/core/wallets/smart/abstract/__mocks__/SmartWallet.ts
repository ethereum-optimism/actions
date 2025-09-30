import type { Address, Hex, LocalAccount, WalletClient } from 'viem'
import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'
import { vi } from 'vitest'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'
import type { TransactionData } from '@/types/lend.js'
import type { SmartWallet } from '@/wallet/core/wallets/smart/abstract/SmartWallet.js'

export type CreateSmartWalletMockOptions = {
  /** Mock wallet address */
  address?: Address
  /** Mock signer */
  signer?: LocalAccount
  /** Custom implementation for addSigner */
  addSignerImpl?: (
    owner: Address | { type: 'webAuthn'; publicKey: Hex },
    chainId: SupportedChainId,
  ) => Promise<number | void>
  /** Custom implementation for findSignerIndex */
  findSignerIndexImpl?: (
    signer: Address | { type: 'webAuthn'; publicKey: Hex },
    chainId: SupportedChainId,
  ) => Promise<number>
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
 * Create a mock SmartWallet instance
 * @description Returns an object typed as `SmartWallet` with configurable
 * implementations for `send` and `sendBatch`. Other abstract members are
 * provided with minimal defaults or throw if invoked (unless overridden).
 */
export function createMock(
  options: CreateSmartWalletMockOptions = {},
): SmartWallet {
  const defaultReceipt = {
    success: true,
  } as unknown as WaitForUserOperationReceiptReturnType

  const address: Address = (options.address ??
    '0x0000000000000000000000000000000000000000') as Address
  const signer: LocalAccount =
    options.signer ?? ({ address, type: 'local' } as unknown as LocalAccount)

  const addSigner = vi.fn(
    async (
      owner: Address | { type: 'webAuthn'; publicKey: Hex },
      chainId: SupportedChainId,
    ): Promise<number | void> => {
      if (options.addSignerImpl) return options.addSignerImpl(owner, chainId)
      return undefined
    },
  )

  const findSignerIndex = vi.fn(
    async (
      signer: Address | { type: 'webAuthn'; publicKey: Hex },
      chainId: SupportedChainId,
    ): Promise<number> => {
      if (options.findSignerIndexImpl)
        return options.findSignerIndexImpl(signer, chainId)
      return -1
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
      throw new Error('walletClient not implemented in SmartWallet mock')
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
      throw new Error('sendTokens not implemented in SmartWallet mock')
    },
  )

  const mock = {
    get address() {
      return address
    },
    get signer() {
      return signer
    },
    addSigner,
    findSignerIndex,
    walletClient,
    send,
    sendBatch,
    sendTokens,
  } as unknown as SmartWallet

  return mock
}

import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'

import type { SupportedChainId } from '@/constants/supportedChains.js'

export class SmartWalletDeploymentError extends Error {
  chainId: SupportedChainId
  receipt?: WaitForUserOperationReceiptReturnType
  constructor(
    message: string,
    chainId: SupportedChainId,
    receipt?: WaitForUserOperationReceiptReturnType,
  ) {
    super(message)
    this.name = 'SmartWalletDeploymentError'
    this.chainId = chainId
    this.receipt = receipt
  }
}

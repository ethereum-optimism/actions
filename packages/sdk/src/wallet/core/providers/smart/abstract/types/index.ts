import type { WaitForUserOperationReceiptReturnType } from 'viem/account-abstraction'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { SmartWallet } from '@/wallet/core/wallets/smart/abstract/SmartWallet.js'
import type { SmartWalletDeploymentError } from '@/wallet/core/wallets/smart/error/errors.js'

interface SmartWalletDeployment {
  chainId: SupportedChainId
  success: boolean
  receipt?: WaitForUserOperationReceiptReturnType
  error?: SmartWalletDeploymentError
}

export type SmartWalletCreationResult<TWallet extends SmartWallet> = {
  wallet: TWallet
  deployments: SmartWalletDeployment[]
}

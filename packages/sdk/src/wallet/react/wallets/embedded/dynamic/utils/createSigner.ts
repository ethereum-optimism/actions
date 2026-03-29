import { isEthereumWallet } from '@dynamic-labs/ethereum'
import type { DynamicWaasEVMConnector } from '@dynamic-labs/waas-evm'
import type { LocalAccount } from 'viem'
import { toAccount } from 'viem/accounts'

import type { DynamicHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'

/**
 * Create a LocalAccount from a Dynamic wallet
 * @description Converts the Dynamic wallet into a viem-compatible LocalAccount that can sign
 * messages and transactions. The returned account uses Dynamic's signing infrastructure
 * under the hood while providing a standard viem interface.
 * @param params.dynamicWallet - Dynamic wallet instance
 * @returns Promise resolving to a LocalAccount configured for signing operations
 * @throws Error if wallet retrieval fails or signing operations are not supported
 */
export async function createSigner(
  params: DynamicHostedWalletToActionsWalletOptions,
): Promise<LocalAccount> {
  const { wallet } = params
  if (!isEthereumWallet(wallet)) {
    throw new Error('Wallet not connected or not EVM compatible')
  }
  const walletClient = await wallet.getWalletClient()
  const connector = wallet.connector as DynamicWaasEVMConnector
  return toAccount({
    address: walletClient.account.address,
    sign: ({ hash }) => {
      return connector.signRawMessage({
        accountAddress: walletClient.account.address,
        message: hash.startsWith('0x') ? hash.slice(2) : hash,
      })
    },
    signMessage: walletClient.signMessage,
    signTransaction: walletClient.signTransaction,
    signTypedData: walletClient.signTypedData,
  })
}

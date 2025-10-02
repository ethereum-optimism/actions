import { toViemAccount } from '@privy-io/react-auth'
import type { CustomSource, LocalAccount } from 'viem'
import { toAccount } from 'viem/accounts'

import type { PrivyHostedWalletToVerbsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'

/**
 * Create a LocalAccount from a Privy wallet
 * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
 * messages and transactions. The returned account uses Privy's signing infrastructure
 * under the hood while providing a standard viem interface.
 * @param params.connectedWallet - Privy connected wallet
 * @returns Promise resolving to a LocalAccount configured for signing operations
 * @throws Error if wallet retrieval fails or signing operations are not supported
 */
export async function createSigner(
  params: PrivyHostedWalletToVerbsWalletOptions,
): Promise<LocalAccount> {
  const privyViemAccount = await toViemAccount({
    wallet: params.connectedWallet,
  })
  return toAccount({
    address: privyViemAccount.address,
    sign: privyViemAccount.sign,
    signMessage: privyViemAccount.signMessage,
    signTransaction: privyViemAccount.signTransaction,
    signTypedData:
      privyViemAccount.signTypedData as CustomSource['signTypedData'],
  })
}

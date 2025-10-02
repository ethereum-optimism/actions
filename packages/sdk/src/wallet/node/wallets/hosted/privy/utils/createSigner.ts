import type { GetViemAccountInputType } from '@privy-io/server-auth/viem'
import { createViemAccount } from '@privy-io/server-auth/viem'
import type { LocalAccount } from 'viem'

import type {
  NodeOptionsMap,
  PrivyHostedWalletToVerbsWalletOptions,
} from '@/wallet/node/providers/hosted/types/index.js'

/**
 * Create a LocalAccount from a Privy wallet
 * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
 * messages and transactions. The returned account uses Privy's signing infrastructure
 * under the hood while providing a standard viem interface.
 * @param params.walletId - Privy wallet identifier
 * @param params.address - Ethereum address of the wallet
 * @param params.privyClient - Privy client instance
 * @returns Promise resolving to a LocalAccount configured for signing operations
 * @throws Error if wallet retrieval fails or signing operations are not supported
 */
export async function createSigner(
  params: PrivyHostedWalletToVerbsWalletOptions & NodeOptionsMap['privy'],
): Promise<LocalAccount> {
  const { walletId, address, privyClient } = params
  const account = await createViemAccount({
    walletId,
    address,
    // TODO: Fix this type error
    privy: privyClient as unknown as GetViemAccountInputType['privy'],
  })
  return account
}

import { createViemAccount } from '@privy-io/node/viem'
import type { LocalAccount } from 'viem'

import type {
  NodeOptionsMap,
  PrivyHostedWalletToActionsWalletOptions,
} from '@/wallet/node/providers/hosted/types/index.js'

/**
 * Create a LocalAccount from a Privy wallet
 * @description Converts the Privy wallet into a viem-compatible LocalAccount that can sign
 * messages and transactions. The returned account uses Privy's signing infrastructure
 * under the hood while providing a standard viem interface.
 * @param params.walletId - Privy wallet identifier
 * @param params.address - Ethereum address of the wallet
 * @param params.privyClient - Privy client instance
 * @param params.authorizationContext - Optional authorization context for the Privy client.
 * Used when Privy needs to sign requests.
 * See https://docs.privy.io/controls/authorization-keys/using-owners/sign/automatic#using-the-authorization-context
 * for more information on building and using the authorization context.
 * @returns LocalAccount configured for signing operations
 * @throws Error if wallet retrieval fails or signing operations are not supported
 */
export function createSigner(
  params: PrivyHostedWalletToActionsWalletOptions & NodeOptionsMap['privy'],
): LocalAccount {
  const { walletId, address, privyClient, authorizationContext } = params
  const account = createViemAccount(privyClient, {
    walletId,
    address,
    authorizationContext,
  })
  return account
}

import type { Address, PublicClient } from 'viem'

import type { TransactionData } from '@/types/transaction.js'
import { buildApprovalTxIfNeeded } from '@/utils/approve.js'

/**
 * Build a standard ERC20 approval transaction for swap input, approving only the deficit.
 *
 * Returns `undefined` when the on-chain allowance already covers `amount`. Applies to
 * every Velodrome/Aerodrome router type: v2 routers, leaf routers, and the Universal
 * Router (which encodes `payerIsUser = true` and pulls tokens via `transferFrom`).
 */
export async function buildTokenApproval(
  token: Address,
  router: Address,
  amount: bigint,
  owner: Address,
  publicClient: PublicClient,
): Promise<TransactionData | undefined> {
  return buildApprovalTxIfNeeded({
    publicClient,
    token,
    owner,
    spender: router,
    amount,
  })
}

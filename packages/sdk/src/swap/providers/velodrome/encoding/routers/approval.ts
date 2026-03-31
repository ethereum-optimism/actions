import type { Address, PublicClient } from 'viem'
import { encodeFunctionData, erc20Abi } from 'viem'

import type { VelodromeRouterType } from '@/swap/providers/velodrome/config.js'
import type { TransactionData } from '@/types/transaction.js'
import { buildApprovalTxIfNeeded } from '@/utils/approve.js'

/**
 * Build a token approval or transfer transaction for swap input.
 *
 * Universal Router uses a direct ERC20 transfer instead of approve+transferFrom.
 * This works because smart wallet batching (4337) bundles the transfer and swap
 * into a single atomic UserOperation — the router receives tokens before executing
 * the swap in the same transaction. The caller must already hold the tokens.
 *
 * Legacy routers (v2, leaf) use standard approve, approving only the deficit.
 */
export async function buildTokenApproval(
  token: Address,
  router: Address,
  routerType: VelodromeRouterType,
  amount: bigint,
  owner: Address,
  publicClient: PublicClient,
): Promise<TransactionData | undefined> {
  if (routerType === 'universal') {
    return {
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'transfer',
        args: [router, amount],
      }),
      value: 0n,
    }
  }

  return buildApprovalTxIfNeeded({
    publicClient,
    token,
    owner,
    spender: router,
    amount,
  })
}

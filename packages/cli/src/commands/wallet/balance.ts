import type { SupportedChainId, TokenBalance } from '@eth-optimism/actions-sdk'

import { walletContext } from '@/context/walletContext.js'
import { CliError } from '@/output/errors.js'
import { writeJson } from '@/output/json.js'
import { type ChainFlags, resolveChainFlags } from '@/resolvers/chains.js'

function filterToChain(
  balances: TokenBalance[],
  chainId: SupportedChainId,
): TokenBalance[] {
  return balances.map((tb) => {
    const entry = tb.chains[chainId]
    return {
      ...tb,
      totalBalance: entry?.balance ?? 0,
      totalBalanceRaw: entry?.balanceRaw ?? 0n,
      chains: entry ? { [chainId]: entry } : {},
    }
  })
}

/**
 * @description Handler for `actions wallet balance`. Fetches ETH and
 * allowlisted ERC-20 balances across every configured chain. Pass
 * `--chain <shortname>` or `--chain-id <id>` to scope the output to a
 * single chain (mutually exclusive). The SDK implements `getBalance`
 * as `Promise.all` over (asset x chain), so any single RPC failure
 * rejects the whole batch; classify that as a retryable `network` error.
 * @param flags - Commander-parsed options; chain selection is optional.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletBalance(flags: ChainFlags = {}): Promise<void> {
  const { wallet, config } = await walletContext()
  const chainId = resolveChainFlags(
    flags,
    config.chains.map((c) => c.chainId),
  )
  try {
    const balances = await wallet.getBalance()
    writeJson(chainId ? filterToChain(balances, chainId) : balances)
  } catch (err) {
    if (err instanceof CliError) throw err
    throw new CliError(
      'network',
      err instanceof Error ? err.message : String(err),
      { cause: err },
    )
  }
}

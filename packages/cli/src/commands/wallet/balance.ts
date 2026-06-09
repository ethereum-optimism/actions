import { walletContext } from '@/context/walletContext.js'
import { CliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { type ChainFlags, resolveChainFlags } from '@/resolvers/chains.js'

/**
 * @description Handler for `actions wallet balance`. Fetches ETH and allowlisted ERC-20 balances across every configured chain. Pass `--chain <shortname>` or `--chain-id <id>` (mutually exclusive) to scope the SDK fan-out; both accept a single value or a comma-separated list (e.g. `--chain base-sepolia,op-sepolia`). The SDK validates ids against the configured chains and surfaces typed errors; RPC failures fall through here as retryable `network` errors.
 * @param flags - Commander-parsed options; chain selection is optional.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletBalance(flags: ChainFlags = {}): Promise<void> {
  const { wallet, config } = await walletContext()
  const chainIds = resolveChainFlags(
    flags,
    config.chains.map((c) => c.chainId),
  )
  try {
    const balances = await wallet.getBalance(
      chainIds ? { chainIds } : undefined,
    )
    printOutput('balance', balances)
  } catch (err) {
    if (err instanceof CliError) throw err
    throw new CliError(
      'network',
      err instanceof Error ? err.message : String(err),
      { cause: err },
    )
  }
}

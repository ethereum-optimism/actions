import { walletContext } from '@/context/walletContext.js'
import { CliError } from '@/output/errors.js'
import { writeJson } from '@/output/json.js'

/**
 * @description Handler for `actions wallet balance`. Fetches ETH and
 * allowlisted ERC-20 balances across every configured chain. The SDK
 * implements `getBalance` as `Promise.all` over (asset × chain), so any
 * single RPC failure rejects the whole batch — this handler classifies
 * that rejection as a retryable `network` error so the agent can retry.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletBalance(): Promise<void> {
  const { wallet } = await walletContext()
  try {
    const balances = await wallet.getBalance()
    writeJson(balances)
  } catch (err) {
    if (err instanceof CliError) throw err
    throw new CliError(
      'network',
      err instanceof Error ? err.message : String(err),
      { cause: err },
    )
  }
}

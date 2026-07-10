import { walletContext } from '@/context/walletContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { type ChainFlags, resolveChainFlags } from '@/resolvers/chains.js'

import { requireLendCapability } from './requireLendCapability.js'

export interface LendPositionsFlags extends ChainFlags {
  nonZeroOnly?: boolean
}

/**
 * @description Handler for `actions wallet lend positions`. Calls `wallet.lend.getPositions()` once across the selected chains, or every configured chain when no chain flag is set. `--chain` and `--chain-id` accept comma-separated lists and map to `GetPositionsParams.chainIds`; `--non-zero-only` maps to `GetPositionsParams.options.nonZeroOnly`.
 * @param flags - Commander-parsed options; all filters are optional.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletLendPositions(
  flags: LendPositionsFlags = {},
): Promise<void> {
  const { wallet, config } = await walletContext()
  requireLendCapability(wallet)
  const chainIds = resolveChainFlags(
    flags,
    config.chains.map((c) => c.chainId),
  )
  const options =
    flags.nonZeroOnly === undefined
      ? undefined
      : { nonZeroOnly: flags.nonZeroOnly }
  try {
    const positions = await wallet.lend.getPositions({
      ...(chainIds ? { chainIds } : {}),
      ...(options ? { options } : {}),
    })
    printOutput('lendPositions', positions)
  } catch (err) {
    rethrowAsCliError(err)
  }
}

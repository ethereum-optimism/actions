import { walletContext } from '@/context/walletContext.js'
import { CliError, rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { type ChainFlags, resolveChainFlags } from '@/resolvers/chains.js'

import { requireLendCapability } from './requireLendCapability.js'

export interface LendPositionsFlags extends ChainFlags {
  nonZeroOnly?: boolean
}

/**
 * @description Handler for `actions wallet lend positions`. Calls `wallet.lend.getPositions()` once to aggregate every configured market/provider position for the EOA in a single SDK call (replacing a per-market `getPosition` fan-out). `--chain`/`--chain-id` flow through to the SDK's `GetPositionsParams.chainId`; `--non-zero-only` maps to `nonZeroOnly`. Emits the SDK `LendMarketPosition[]` shape verbatim (bigints stringified by the JSON sink). Errors surface through `rethrowAsCliError`.
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
  if (chainIds && chainIds.length > 1) {
    throw new CliError(
      'validation',
      'lend positions accepts a single chain (the SDK filter is single-valued)',
      { chainIds },
    )
  }
  const chainId = chainIds?.[0]
  try {
    const positions = await wallet.lend.getPositions({
      chainId,
      nonZeroOnly: flags.nonZeroOnly,
    })
    printOutput('lendPositions', positions)
  } catch (err) {
    rethrowAsCliError(err)
  }
}

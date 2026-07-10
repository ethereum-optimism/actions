import { baseContext } from '@/context/baseContext.js'
import { CliError, rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { configuredAssets, resolveAsset } from '@/resolvers/assets.js'
import { type ChainFlags, resolveChainFlags } from '@/resolvers/chains.js'

export interface BorrowMarketsFlags extends ChainFlags {
  collateral?: string
  borrowAsset?: string
}

/**
 * @description Handler for `actions borrow markets`. Aggregates `getMarkets()` across every configured borrow provider (currently Morpho Blue). Supports `--collateral`, `--borrow-asset`, and `--chain` / `--chain-id` filters that flow through to the SDK's `GetBorrowMarketsParams`. Read-only, no signer needed. Errors surface through `rethrowAsCliError`, which maps SDK `ActionsError` subclasses to `validation` / `config` envelopes and unrecognised throws to retryable `network`.
 * @param flags - Commander-parsed options; all filters are optional.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runBorrowMarkets(
  flags: BorrowMarketsFlags = {},
): Promise<void> {
  const { actions, config } = baseContext()
  const allow = configuredAssets(config)
  const collateralAsset = flags.collateral
    ? resolveAsset(flags.collateral, allow)
    : undefined
  const borrowAsset = flags.borrowAsset
    ? resolveAsset(flags.borrowAsset, allow)
    : undefined
  const chainIds = resolveChainFlags(
    flags,
    config.chains.map((c) => c.chainId),
  )
  if (chainIds && chainIds.length > 1) {
    throw new CliError(
      'validation',
      'borrow markets accepts a single chain (the SDK filter is single-valued)',
      { chainIds },
    )
  }
  const chainId = chainIds?.[0]
  try {
    const markets = await actions.borrow.getMarkets({
      collateralAsset,
      borrowAsset,
      chainId,
    })
    printOutput('borrowMarkets', markets)
  } catch (err) {
    rethrowAsCliError(err)
  }
}

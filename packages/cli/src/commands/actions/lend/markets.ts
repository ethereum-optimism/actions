import { baseContext } from '@/context/baseContext.js'
import { CliError, rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { configuredAssets, resolveAsset } from '@/resolvers/assets.js'
import { type ChainFlags, resolveChainFlags } from '@/resolvers/chains.js'

export interface LendMarketsFlags extends ChainFlags {
  asset?: string
}

/**
 * @description Handler for `actions lend markets`. Aggregates `getMarkets()` across every configured lend provider (Morpho + Aave). Supports `--asset` and `--chain`/`--chain-id` filters that flow through to the SDK's `GetLendMarketsParams`. Read-only, no signer needed. Errors surface through `rethrowAsCliError`, which maps SDK `ActionsError` subclasses to `validation`/`config` envelopes and unrecognised throws to retryable `network`.
 * @param flags - Commander-parsed options; all filters are optional.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runLendMarkets(
  flags: LendMarketsFlags = {},
): Promise<void> {
  const { actions, config } = baseContext()
  const asset = flags.asset
    ? resolveAsset(flags.asset, configuredAssets(config))
    : undefined
  const chainIds = resolveChainFlags(
    flags,
    config.chains.map((c) => c.chainId),
  )
  if (chainIds && chainIds.length > 1) {
    throw new CliError(
      'validation',
      'lend markets accepts a single chain (the SDK filter is single-valued)',
      { chainIds },
    )
  }
  const chainId = chainIds?.[0]
  try {
    const markets = await actions.lend.getMarkets({ asset, chainId })
    printOutput('lendMarkets', markets)
  } catch (err) {
    rethrowAsCliError(err)
  }
}

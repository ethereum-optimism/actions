import { walletContext } from '@/context/walletContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import { type ChainFlags, resolveChainFlags } from '@/resolvers/chains.js'

import { requireLendCapability } from './requireLendCapability.js'

export interface LendPositionsFlags extends ChainFlags {
  nonZeroOnly?: boolean
}

/**
 * @description Lists wallet lend positions.
 * @param flags - Optional chain and balance filters.
 * @returns A promise that resolves after writing output.
 * @throws A CLI error when position retrieval fails.
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

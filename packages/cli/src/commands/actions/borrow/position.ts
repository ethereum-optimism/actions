import { type EnsName, isEnsName } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

import { baseContext } from '@/context/baseContext.js'
import { rethrowAsCliError } from '@/output/errors.js'
import { printOutput } from '@/output/printOutput.js'
import {
  configuredBorrowMarkets,
  resolveBorrowMarket,
} from '@/resolvers/borrowMarkets.js'
import { requireEnsNameOrAddress } from '@/resolvers/ens.js'

type BaseContext = ReturnType<typeof baseContext>

export interface BorrowPositionFlags {
  market: string
  wallet: string
}

/**
 * @description Handler for `actions borrow position --market <name> --wallet <address|ens>`.
 * @param flags - Commander-parsed options.
 * @returns Promise that resolves once stdout has been written.
 * @throws `CliError` with code `validation` or `network`.
 */
export async function runBorrowPosition(
  flags: BorrowPositionFlags,
): Promise<void> {
  const { actions, config } = baseContext()
  const market = resolveBorrowMarket(
    flags.market,
    configuredBorrowMarkets(config),
  )
  const walletInput = requireEnsNameOrAddress(flags.wallet, '--wallet')
  try {
    const walletAddress = await resolveWalletAddress(actions, walletInput)
    const position = await actions.borrow.getPosition({
      marketId: market,
      walletAddress,
    })
    printOutput('borrowPosition', position)
  } catch (err) {
    rethrowAsCliError(err)
  }
}

async function resolveWalletAddress(
  actions: BaseContext['actions'],
  input: Address | EnsName,
): Promise<Address> {
  if (!isEnsName(input)) return input
  return actions.ens.getAddress(input)
}

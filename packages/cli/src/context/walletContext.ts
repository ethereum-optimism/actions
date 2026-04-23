import type { LocalAccount } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { requireEnv } from '@/config/env.js'
import { type BaseContext, baseContext } from '@/context/baseContext.js'
import { CliError } from '@/output/errors.js'

type Hex = `0x${string}`

export interface WalletContext extends BaseContext {
  signer: LocalAccount
  wallet: Awaited<
    ReturnType<BaseContext['actions']['wallet']['toActionsWallet']>
  >
}

function parseSigner(privateKey: string): LocalAccount {
  try {
    return privateKeyToAccount(privateKey as Hex)
  } catch (cause) {
    throw new CliError(
      'config',
      'Malformed PRIVATE_KEY: expected a 0x-prefixed 32-byte hex string',
      { reason: cause instanceof Error ? cause.message : String(cause) },
    )
  }
}

/**
 * @description Builds the tier-1 context for wallet-scoped commands
 * (`wallet address`, `wallet balance`, and PR 2/3 lend/swap handlers).
 * Derives a viem `LocalAccount` from `PRIVATE_KEY` and wraps it in an
 * EOA-backed Actions wallet via `actions.wallet.toActionsWallet(localAccount)`.
 * No smart-wallet factory call, no bundler dependency - the signer pays
 * gas directly from its own balance.
 * @returns Context with config, actions, signer, and the EOA-backed wallet.
 * @throws `CliError` with code `config` when `PRIVATE_KEY` is missing or
 * malformed.
 */
export async function walletContext(): Promise<WalletContext> {
  const base = baseContext()
  const signer = parseSigner(requireEnv('PRIVATE_KEY'))
  const wallet = await base.actions.wallet.toActionsWallet(signer)
  return { ...base, signer, wallet }
}

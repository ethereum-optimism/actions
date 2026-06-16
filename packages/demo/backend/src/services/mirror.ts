import type { SmartWallet } from '@eth-optimism/actions-sdk'
import { USDC_DEMO } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { formatUnits } from 'viem'

import { mintUsdcDemo, transferUsdcDemo } from '@/services/mint.js'

/**
 * Demo-only "mirror" accounting for the Aave borrow flow.
 *
 * Aave is a shared protocol pool, so the demo borrows real USDC on OP Sepolia
 * but keeps the demo economy coherent by mirroring that borrow as `USDC_DEMO`
 * on Base Sepolia: mint on borrow, remove on repay. This lives entirely in the
 * demo backend; the SDK `AaveBorrowProvider` only ever touches real Aave.
 *
 * `DemoUSDC.mint` is permissionless and the demo wallet is server-custodied
 * with gasless `sendBatch`, so the backend drives both legs through the user's
 * own wallet with no extra signature. The token has no `burn`, so "removal" is
 * a transfer to a dead sink address rather than a true burn.
 *
 * Both legs are best-effort and silent: they fire after the real Aave tx, do
 * not block the borrow/repay response, never surface as user-facing activity,
 * and are observable only through operator logs.
 */

/** Dead sink for mirror removals (DemoUSDC has no burn function). */
const MIRROR_SINK_ADDRESS =
  '0x000000000000000000000000000000000000dEaD' as Address

type MirrorAction = 'mint' | 'remove'

function logMirror(
  action: MirrorAction,
  fields: { wallet: Address; amount: bigint; realTxHash?: string },
  status: 'ok' | 'failed',
  error?: unknown,
): void {
  const base = {
    scope: 'aave-borrow-mirror',
    action,
    status,
    wallet: fields.wallet,
    amount: formatUnits(fields.amount, USDC_DEMO.metadata.decimals),
    realTxHash: fields.realTxHash,
  }
  if (status === 'failed') {
    console.error('[mirror] failed', { ...base, error: String(error) })
  } else {
    console.info('[mirror] settled', base)
  }
}

/**
 * Mint `amountWei` of `USDC_DEMO` to the user's wallet on Base Sepolia after a
 * real Aave borrow. Best-effort: resolves once the mirror tx settles, swallows
 * and logs failures so it can never reject into the borrow response path.
 */
export async function mintMirrorUsdc(
  wallet: SmartWallet,
  amountWei: bigint,
  realTxHash?: string,
): Promise<void> {
  try {
    await mintUsdcDemo(wallet, wallet.address, amountWei)
    logMirror(
      'mint',
      { wallet: wallet.address, amount: amountWei, realTxHash },
      'ok',
    )
  } catch (error) {
    logMirror(
      'mint',
      { wallet: wallet.address, amount: amountWei, realTxHash },
      'failed',
      error,
    )
  }
}

/**
 * Remove `amountWei` of `USDC_DEMO` from the user's wallet on Base Sepolia
 * after a real Aave repay, by transferring it to the dead sink. The amount is
 * bounded by the caller to the repaid amount (never the full balance).
 * Best-effort and silent, like the mint leg.
 */
export async function removeMirrorUsdc(
  wallet: SmartWallet,
  amountWei: bigint,
  realTxHash?: string,
): Promise<void> {
  try {
    await transferUsdcDemo(wallet, MIRROR_SINK_ADDRESS, amountWei)
    logMirror(
      'remove',
      { wallet: wallet.address, amount: amountWei, realTxHash },
      'ok',
    )
  } catch (error) {
    logMirror(
      'remove',
      { wallet: wallet.address, amount: amountWei, realTxHash },
      'failed',
      error,
    )
  }
}

export { MIRROR_SINK_ADDRESS }

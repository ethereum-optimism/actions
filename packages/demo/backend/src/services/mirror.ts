import type { SmartWallet } from '@eth-optimism/actions-sdk'
import { USDC_DEMO } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'
import { formatUnits } from 'viem'

import { mintUsdcDemo, transferUsdcDemo } from '@/services/usdcDemo.js'

// Demo-only mirror accounting: after each real Aave borrow/repay on OP Sepolia,
// mint/remove an equivalent USDC_DEMO on Base Sepolia. DemoUSDC.mint is
// permissionless; removal transfers to a dead sink (no burn). Both legs are
// best-effort and silent: fire-and-forget, never block the response.

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

/** Mint USDC_DEMO to the wallet after a real Aave borrow. Best-effort: swallows and logs failures. */
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

/** Transfer USDC_DEMO to the dead sink after a real Aave repay. Best-effort: swallows and logs failures. */
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

/**
 * Demo "magic" for the Aave borrow flow, isolated so the real borrow path stays
 * honest. Everything here exists only because the demo fakes a coherent economy
 * on top of a real Aave borrow.
 *
 * Aave borrows real USDC on OP Sepolia, but the demo economy is denominated in
 * USDC_DEMO on Base Sepolia, so a real borrow is mirrored 1:1: mint USDC_DEMO on
 * borrow, remove it (transfer to a dead sink) on repay. This module owns the
 * mirror-market predicate, the repay-gate asset swap, and the mint/burn legs.
 *
 * The backend mirrors for the server wallet (see backend/src/services/mirror.ts);
 * the in-browser (Turnkey / Dynamic) wallet borrows directly via the SDK and
 * never hits the backend, so it runs the mirror here through `sendBatch`. Both
 * legs are best-effort and silent: fired after the real Aave tx, never thrown
 * into the borrow/repay path, observable only through console logs; on success
 * they dispatch the earn positions-changed event so balances refresh.
 */

import { encodeFunctionData, formatUnits, type Address } from 'viem'
import { baseSepolia } from 'viem/chains'
import {
  type Asset,
  type BorrowMarket,
  type BorrowMarketId,
  getAssetAddress,
  USDC_DEMO,
  type Wallet,
} from '@eth-optimism/actions-sdk/react'

import { mintableErc20Abi } from '@/abis/mintableErc20Abi'
import { AaveETHBorrowUSDCDemo } from '@/constants/markets'
import { dispatchEarnPositionsChanged } from '@/utils/earnSync'
import { sameMarketId } from '@/utils/marketId'

type MirrorWallet = Pick<Wallet, 'address'> & { sendBatch: Wallet['sendBatch'] }

/**
 * True only for the one market the demo mirrors. Matches on the full market
 * identity, not just `kind: 'aave-v3'`, so a real (non-mirrored) Aave market
 * added later is not mistaken for magic.
 */
export function isMirrorMarket(marketId: BorrowMarketId): boolean {
  return sameMarketId(marketId, AaveETHBorrowUSDCDemo)
}

/**
 * The asset whose balance gates a repay. The mirror market borrows real USDC but
 * the user holds and spends USDC_DEMO, so gate on that; every other market gates
 * on its real borrow asset (passed as `borrowAsset`).
 */
export function repayGateAsset(
  market: BorrowMarket | null,
  borrowAsset: Asset | null,
): Asset | null {
  return market && isMirrorMarket(market.marketId) ? USDC_DEMO : borrowAsset
}

/**
 * Fire the USDC_DEMO mirror for an in-browser-wallet borrow receipt: `mint` on
 * borrow, `remove` on repay. No-op for non-mirror markets or zero-amount
 * receipts. Best-effort and silent, like the mint/burn legs it dispatches.
 */
export function mirrorBorrowReceipt(
  wallet: MirrorWallet,
  marketId: BorrowMarketId,
  action: 'mint' | 'remove',
  receipt: { borrowAmount?: bigint },
): void {
  if (!isMirrorMarket(marketId)) return
  const amount = receipt.borrowAmount
  if (amount == null || amount <= 0n) return
  void (action === 'mint'
    ? mintMirrorUsdcDemo(wallet, amount)
    : removeMirrorUsdcDemo(wallet, amount))
}

/** Dead sink for mirror removals (DemoUSDC has no burn function). */
const MIRROR_SINK_ADDRESS =
  '0x000000000000000000000000000000000000dEaD' as Address

async function sendMirrorTx(
  wallet: MirrorWallet,
  action: 'mint' | 'remove',
  amountWei: bigint,
): Promise<void> {
  try {
    const usdcDemo = getAssetAddress(USDC_DEMO, baseSepolia.id)
    const data =
      action === 'mint'
        ? encodeFunctionData({
            abi: mintableErc20Abi,
            functionName: 'mint',
            args: [wallet.address, amountWei],
          })
        : encodeFunctionData({
            abi: mintableErc20Abi,
            functionName: 'transfer',
            args: [MIRROR_SINK_ADDRESS, amountWei],
          })
    await wallet.sendBatch([{ to: usdcDemo, data, value: 0n }], baseSepolia.id)
    console.info('[mirror] settled', {
      scope: 'aave-borrow-mirror',
      action,
      wallet: wallet.address,
      amount: formatUnits(amountWei, USDC_DEMO.metadata.decimals),
    })
    // Let balances/positions pick up the minted/removed USDC_DEMO.
    dispatchEarnPositionsChanged()
  } catch (error) {
    console.error('[mirror] failed', {
      scope: 'aave-borrow-mirror',
      action,
      wallet: wallet.address,
      amount: formatUnits(amountWei, USDC_DEMO.metadata.decimals),
      error: String(error),
    })
  }
}

/** Mint `amountWei` USDC_DEMO to the wallet after a real Aave borrow. */
export function mintMirrorUsdcDemo(
  wallet: MirrorWallet,
  amountWei: bigint,
): Promise<void> {
  return sendMirrorTx(wallet, 'mint', amountWei)
}

/** Remove `amountWei` USDC_DEMO (transfer to sink) after a real Aave repay. */
export function removeMirrorUsdcDemo(
  wallet: MirrorWallet,
  amountWei: bigint,
): Promise<void> {
  return sendMirrorTx(wallet, 'remove', amountWei)
}

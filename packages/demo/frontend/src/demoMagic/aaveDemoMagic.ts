// Aave borrow demo magic: mirrors each real USDC borrow/repay to USDC_DEMO on Base Sepolia (mint on borrow, transfer-to-sink on repay). Best-effort and silent.

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

/** True only for the one mirrored market; matches full identity to avoid false-positives on future non-mirrored Aave markets. */
export function isMirrorMarket(marketId: BorrowMarketId): boolean {
  return sameMarketId(marketId, AaveETHBorrowUSDCDemo)
}

/**
 * Resolve the balance used to gate a repayment.
 * @description Uses the Base USDC_DEMO mirror for the Aave demo and the
 * market-chain debt asset for ordinary markets.
 * @param market - Active borrow market
 * @param borrowAsset - Debt asset shown by the active position
 * @returns Asset and chain containing the spendable gate balance
 */
export function resolveRepayBalanceSource(
  market: BorrowMarket | null,
  borrowAsset: Asset | null,
) {
  if (market && isMirrorMarket(market.marketId)) {
    return { asset: USDC_DEMO, chainId: baseSepolia.id }
  }
  return { asset: borrowAsset, chainId: market?.marketId.chainId }
}

/** Fires the USDC_DEMO mint (borrow) or remove (repay) for in-browser wallets. No-op for non-mirror markets or zero amounts. */
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

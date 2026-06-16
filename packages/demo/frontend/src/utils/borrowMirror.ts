/**
 * Frontend (in-browser wallet) "mirror" for the Aave borrow flow.
 *
 * Aave borrows real USDC on OP Sepolia, but the demo economy is denominated in
 * USDC_DEMO on Base Sepolia. The backend mirrors this for the server wallet
 * (see packages/demo/backend/src/services/mirror.ts); the frontend (Turnkey /
 * Dynamic) wallet borrows directly via the SDK and never hits the backend, so
 * it mints/removes USDC_DEMO itself through the in-browser wallet's `sendBatch`.
 *
 * Both legs are best-effort and silent: fired after the real Aave tx, never
 * thrown into the borrow/repay path, observable only through console logs. On
 * success they dispatch the earn positions-changed event so balances refresh
 * once the mirror tx settles.
 */

import { encodeFunctionData, formatUnits, type Address } from 'viem'
import { baseSepolia } from 'viem/chains'
import {
  getAssetAddress,
  USDC_DEMO,
  type Wallet,
} from '@eth-optimism/actions-sdk/react'

import { mintableErc20Abi } from '@/abis/mintableErc20Abi'
import { dispatchEarnPositionsChanged } from '@/utils/earnSync'

type MirrorWallet = Pick<Wallet, 'address'> & { sendBatch: Wallet['sendBatch'] }

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

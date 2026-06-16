import type { SmartWallet } from '@eth-optimism/actions-sdk'
import { getAssetAddress, USDC_DEMO } from '@eth-optimism/actions-sdk'
import { type Address, encodeFunctionData } from 'viem'
import { baseSepolia } from 'viem/chains'

import { mintableErc20Abi } from '@/abis/mintableErc20Abi.js'

/**
 * Raw USDC_DEMO token operations on Base Sepolia. The demo USDC is a mintable
 * mock with no `burn`, so callers mint to a wallet and "burn" by transferring
 * to a sink. These wrap the `encodeFunctionData` + gasless `sendBatch` pair so
 * callers (mirror accounting, the mint faucet) don't hand-roll the calldata.
 */

function sendUsdcDemoCall(
  wallet: SmartWallet,
  data: `0x${string}`,
): ReturnType<SmartWallet['sendBatch']> {
  return wallet.sendBatch(
    [{ to: getAssetAddress(USDC_DEMO, baseSepolia.id), data, value: 0n }],
    baseSepolia.id,
  )
}

/** Mint `amountWei` of USDC_DEMO to `to` on Base Sepolia. */
export function mintUsdcDemo(
  wallet: SmartWallet,
  to: Address,
  amountWei: bigint,
): ReturnType<SmartWallet['sendBatch']> {
  return sendUsdcDemoCall(
    wallet,
    encodeFunctionData({
      abi: mintableErc20Abi,
      functionName: 'mint',
      args: [to, amountWei],
    }),
  )
}

/** Transfer `amountWei` of USDC_DEMO to `to` on Base Sepolia. */
export function transferUsdcDemo(
  wallet: SmartWallet,
  to: Address,
  amountWei: bigint,
): ReturnType<SmartWallet['sendBatch']> {
  return sendUsdcDemoCall(
    wallet,
    encodeFunctionData({
      abi: mintableErc20Abi,
      functionName: 'transfer',
      args: [to, amountWei],
    }),
  )
}

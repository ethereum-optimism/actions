import { walletContext } from '@/context/walletContext.js'
import { printOutput } from '@/output/printOutput.js'

/**
 * @description Handler for `actions wallet address`. Emits the EOA
 * address derived from `PRIVATE_KEY`. Pure, no RPC call.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletAddress(): Promise<void> {
  const { wallet } = await walletContext()
  printOutput('address', { address: wallet.address })
}

import { walletContext } from '@/context/walletContext.js'
import { writeJson } from '@/output/json.js'

/**
 * @description Handler for `actions wallet address`. Returns the EOA
 * address derived from `PRIVATE_KEY`. Pure — no RPC call, no factory
 * lookup.
 * @returns Promise that resolves once stdout has been written.
 */
export async function runWalletAddress(): Promise<void> {
  const { wallet } = await walletContext()
  writeJson({ address: wallet.address })
}

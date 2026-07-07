/**
 * Real `ChainManager` wiring for network fork tests.
 *
 * Replaces the per-file `{ ... } as unknown as ChainManager` fakes that
 * satisfied the type checker while bypassing the real client wiring the
 * signing path uses. One helper, one chain-wiring path.
 */
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { ChainManager } from '@/services/ChainManager.js'

/**
 * Build a real `ChainManager` whose public client for `chainId` is bound to
 * the Anvil fork RPC.
 * @description Creates the concrete chain wiring network tests exercise.
 * @param rpcUrl - Local Anvil fork JSON-RPC URL.
 * @param chainId - Chain the fork serves; the wallet/provider under test must
 * use this same chain.
 * @returns A `ChainManager` instance backed by the fork RPC.
 */
export function createForkChainManager(
  rpcUrl: string,
  chainId: SupportedChainId,
): ChainManager {
  return new ChainManager([{ chainId, rpcUrls: [rpcUrl] }])
}

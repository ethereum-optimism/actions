import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

import { getActions } from '@/config/actions.js'

/**
 * Resolve a token address to an Asset using the configured asset list
 * @throws if the token address is not found for the given chain
 */
export function resolveAsset(
  tokenAddress: Address | 'native',
  chainId: SupportedChainId,
) {
  const assets = getActions().getSupportedAssets()
  const asset = assets.find((token) => token.address[chainId] === tokenAddress)
  if (!asset) {
    throw new Error(`Asset not found for token address: ${tokenAddress}`)
  }
  return asset
}

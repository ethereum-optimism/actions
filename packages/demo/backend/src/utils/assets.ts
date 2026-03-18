import type { Asset, SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Address } from 'viem'

/**
 * Resolve a token address to an Asset from a provided asset list
 * @throws if the token address is not found for the given chain
 */
export function resolveAsset(
  tokenAddress: Address | 'native',
  chainId: SupportedChainId,
  assets: Asset[],
): Asset {
  const asset = assets.find(
    (token) => token.address[chainId] === tokenAddress,
  )
  if (!asset) {
    throw new Error(`Asset not found for token address: ${tokenAddress}`)
  }
  return asset
}

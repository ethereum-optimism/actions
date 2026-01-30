import type { Address } from 'viem'
import { baseSepolia } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Uniswap contract addresses
 */
export interface UniswapAddresses {
  poolManager: Address
  positionManager: Address
  universalRouter: Address
  quoter: Address
  permit2: Address
}

/**
 * Uniswap V4 contract addresses per chain
 * @description Addresses from https://docs.uniswap.org/contracts/v4/deployments
 */
const UNISWAP_ADDRESSES: Partial<Record<SupportedChainId, UniswapAddresses>> = {
  // Base Sepolia (84532)
  [baseSepolia.id]: {
    poolManager: '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408',
    positionManager: '0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80',
    universalRouter: '0x492e6456d9528771018deb9e87ef7750ef184104',
    quoter: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba',
    permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
  },
}

/**
 * WETH addresses per chain
 */
const WETH_ADDRESSES: Partial<Record<SupportedChainId, Address>> = {
  [baseSepolia.id]: '0x4200000000000000000000000000000000000006',
}

/**
 * Uniswap V4 Subgraph URLs per chain
 * @description Used for pool discovery via The Graph
 */
const SUBGRAPH_URLS: Partial<Record<SupportedChainId, string>> = {
  // Testnets may not have official subgraphs
  [baseSepolia.id]: undefined,
}

/**
 * Get Uniswap contract addresses for a chain
 */
export function getUniswapAddresses(
  chainId: SupportedChainId,
): UniswapAddresses {
  const addresses = UNISWAP_ADDRESSES[chainId]
  if (!addresses) {
    throw new Error(`Uniswap not supported on chain ${chainId}`)
  }
  return addresses
}

/**
 * Get supported chain IDs for Uniswap
 */
export function getSupportedChainIds(): SupportedChainId[] {
  return Object.keys(UNISWAP_ADDRESSES).map(Number) as SupportedChainId[]
}

/**
 * Get WETH address for a chain
 */
export function getWethAddress(chainId: SupportedChainId): Address {
  const address = WETH_ADDRESSES[chainId]
  if (!address) {
    throw new Error(`No WETH address for chain ${chainId}`)
  }
  return address
}

/**
 * Get Uniswap V4 Subgraph URL for a chain
 */
export function getSubgraphUrl(chainId: SupportedChainId): string | undefined {
  return SUBGRAPH_URLS[chainId]
}

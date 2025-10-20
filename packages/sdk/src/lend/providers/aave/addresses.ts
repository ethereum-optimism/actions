import type { Address } from 'viem'

/**
 * Aave V3 Pool addresses for Optimism Superchain networks
 * @description Hardcoded Pool contract addresses for each supported chain
 */

/**
 * Mainnet Pool addresses
 */
export const POOL_ADDRESSES_MAINNET: Record<number, Address> = {
  // Optimism Mainnet
  10: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  // Base Mainnet
  8453: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
} as const

/**
 * Testnet Pool addresses
 */
export const POOL_ADDRESSES_TESTNET: Record<number, Address> = {
  // Optimism Sepolia
  11155420: '0xb50201558b00496a145fe76f7424749556e326d8',
  // Base Sepolia
  84532: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
} as const

/**
 * All Pool addresses (mainnet + testnet)
 */
export const POOL_ADDRESSES: Record<number, Address> = {
  ...POOL_ADDRESSES_MAINNET,
  ...POOL_ADDRESSES_TESTNET,
} as const

/**
 * Get Pool address for a given chain ID
 * @param chainId - Chain ID
 * @returns Pool address if supported, undefined otherwise
 */
export function getPoolAddress(chainId: number): Address | undefined {
  return POOL_ADDRESSES[chainId]
}

/**
 * Check if a chain ID has Aave V3 deployed
 * @param chainId - Chain ID to check
 * @returns true if Aave V3 is deployed on this chain
 */
export function isAaveChainSupported(chainId: number): boolean {
  return chainId in POOL_ADDRESSES
}

/**
 * Get all supported chain IDs
 * @returns Array of chain IDs with Aave V3 deployed
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(POOL_ADDRESSES).map(Number)
}

import type { Address } from 'viem'
import { base, baseSepolia, optimism, optimismSepolia } from 'viem/chains'

/**
 * Aave V3 Pool addresses for Optimism Superchain networks
 * @description Hardcoded Pool contract addresses for each supported chain
 */

/**
 * Mainnet Pool addresses
 */
export const POOL_ADDRESSES_MAINNET: Record<number, Address> = {
  [optimism.id]: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
  [base.id]: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
} as const

/**
 * Testnet Pool addresses
 */
export const POOL_ADDRESSES_TESTNET: Record<number, Address> = {
  [optimismSepolia.id]: '0xb50201558b00496a145fe76f7424749556e326d8',
  [baseSepolia.id]: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
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

/**
 * Aave V3 WETHGateway addresses for Optimism Superchain networks
 * @description Gateway contracts that handle native ETH wrapping and depositing
 */

/**
 * Mainnet WETHGateway addresses
 */
export const WETH_GATEWAY_ADDRESSES_MAINNET: Record<number, Address> = {
  [optimism.id]: '0x5f2508cAE9923b02316254026CD43d7902866725',
  [base.id]: '0xa0d9C1E9E48Ca30c8d8C3B5D69FF5dc1f6DFfC24',
} as const

/**
 * Testnet WETHGateway addresses
 */
export const WETH_GATEWAY_ADDRESSES_TESTNET: Record<number, Address> = {
  [optimismSepolia.id]: '0x589750BA8aF186cE5B55391B0b7148cAD43a1619',
  [baseSepolia.id]: '0x0568130e794429D2eEBC4dafE18f25Ff1a1ed8b6',
} as const

/**
 * All WETHGateway addresses (mainnet + testnet)
 */
export const WETH_GATEWAY_ADDRESSES: Record<number, Address> = {
  ...WETH_GATEWAY_ADDRESSES_MAINNET,
  ...WETH_GATEWAY_ADDRESSES_TESTNET,
} as const

/**
 * Get WETHGateway address for a given chain ID
 * @param chainId - Chain ID
 * @returns WETHGateway address if supported, undefined otherwise
 */
export function getWETHGatewayAddress(chainId: number): Address | undefined {
  return WETH_GATEWAY_ADDRESSES[chainId]
}

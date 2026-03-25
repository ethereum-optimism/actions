import type { Address } from 'viem'
import {
  base,
  baseSepolia,
  ink,
  optimism,
  optimismSepolia,
  soneium,
} from 'viem/chains'


import type { SupportedChainId } from '@/constants/supportedChains.js'

/**
 * Aave V3 contract addresses per chain
 */
export interface AaveAddresses {
  pool: Address
  wethGateway: Address
  uiPoolDataProvider: Address
  poolAddressesProvider: Address
}

/**
 * Aave V3 contract addresses for OP Stack chains
 * @see https://github.com/bgd-labs/aave-address-book
 */
const AAVE_ADDRESSES: Partial<Record<SupportedChainId, AaveAddresses>> = {
  [optimism.id]: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    wethGateway: '0x5f2508cAE9923b02316254026CD43d7902866725',
    uiPoolDataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
  },
  [base.id]: {
    pool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    wethGateway: '0xa0d9C1E9E48Ca30c8d8C3B5D69FF5dc1f6DFfC24',
    uiPoolDataProvider: '0xd82a47fdebB5bf5329b09441C3DaB4b5df2153Ad',
    poolAddressesProvider: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
  },
  [soneium.id]: {
    pool: '0xDd3d7A7d03D9fD9ef45f3E587287922eF65CA38B',
    wethGateway: '0x6376D4df995f32f308f2d5049a7a320943023232',
    uiPoolDataProvider: '0xc69299Ddd3a704F6954c8Ae1AD00e0892d77Aee4',
    poolAddressesProvider: '0x82405D1a189bd6cE4667809C35B37fBE136A4c5B',
  },
  [ink.id]: {
    pool: '0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA',
    wethGateway: '0xDe090EfCD6ef4b86792e2D84E55a5fa8d49D25D2',
    uiPoolDataProvider: '0xF1485fb7DBFa5db0B368FeA808FD6ff945c36064',
    poolAddressesProvider: '0x4172E6aAEC070ACB31aaCE343A58c93E4C70f44D',
  },
  [optimismSepolia.id]: {
    pool: '0xb50201558b00496a145fe76f7424749556e326d8',
    wethGateway: '0x589750BA8aF186cE5B55391B0b7148cAD43a1619',
    uiPoolDataProvider: '0x86E2938daE289763D4e09a7e42c5cCcA62Cf9809',
    poolAddressesProvider: '0x36616cf17557639614c1cdDb356b1B83fc0B2132',
  },
  [baseSepolia.id]: {
    pool: '0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27',
    wethGateway: '0x0568130e794429D2eEBC4dafE18f25Ff1a1ed8b6',
    uiPoolDataProvider: '0xBc9f5b7E248451CdD7cA54e717a2BFe1F32b566b',
    poolAddressesProvider: '0xE4C23309117Aa30342BFaae6c95c6478e0A4Ad00',
  },
}

/**
 * Get all Aave addresses for a chain
 */
export function getAaveAddresses(chainId: number): AaveAddresses | undefined {
  return AAVE_ADDRESSES[chainId as SupportedChainId]
}

/**
 * Get Pool address for a given chain ID
 */
export function getPoolAddress(chainId: number): Address | undefined {
  return getAaveAddresses(chainId)?.pool
}

/**
 * Get WETHGateway address for a given chain ID
 */
export function getWETHGatewayAddress(chainId: number): Address | undefined {
  return getAaveAddresses(chainId)?.wethGateway
}

/**
 * Get all supported chain IDs
 */
export function getSupportedChainIds(): number[] {
  return Object.keys(AAVE_ADDRESSES).map(Number)
}

export const POOL_ADDRESSES_MAINNET: Record<number, Address> = {
  [optimism.id]: AAVE_ADDRESSES[optimism.id]!.pool,
  [base.id]: AAVE_ADDRESSES[base.id]!.pool,
  [soneium.id]: AAVE_ADDRESSES[soneium.id]!.pool,
  [ink.id]: AAVE_ADDRESSES[ink.id]!.pool,
}
export const POOL_ADDRESSES_TESTNET: Record<number, Address> = {
  [optimismSepolia.id]: AAVE_ADDRESSES[optimismSepolia.id]!.pool,
  [baseSepolia.id]: AAVE_ADDRESSES[baseSepolia.id]!.pool,
}
export const WETH_GATEWAY_ADDRESSES_MAINNET: Record<number, Address> = {
  [optimism.id]: AAVE_ADDRESSES[optimism.id]!.wethGateway,
  [base.id]: AAVE_ADDRESSES[base.id]!.wethGateway,
  [soneium.id]: AAVE_ADDRESSES[soneium.id]!.wethGateway,
  [ink.id]: AAVE_ADDRESSES[ink.id]!.wethGateway,
}
export const WETH_GATEWAY_ADDRESSES_TESTNET: Record<number, Address> = {
  [optimismSepolia.id]: AAVE_ADDRESSES[optimismSepolia.id]!.wethGateway,
  [baseSepolia.id]: AAVE_ADDRESSES[baseSepolia.id]!.wethGateway,
}

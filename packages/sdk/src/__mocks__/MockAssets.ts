import type { Address } from 'viem'
import { base, baseSepolia, mode, optimism, unichain } from 'viem/chains'

import type { Asset } from '@/types/asset.js'

/**
 * Mock USDC asset for testing.
 * Includes addresses for all commonly tested chains.
 */
export const MockUSDCAsset: Asset = {
  address: {
    [optimism.id]: '0x1111111111111111111111111111111111111111' as Address,
    [base.id]: '0x2222222222222222222222222222222222222222' as Address,
    [baseSepolia.id]: '0x3333333333333333333333333333333333333333' as Address,
    [unichain.id]: '0xA0b86991c431c924C2407E4C573C686cc8C6c5b7' as Address,
    [mode.id]: '0x5555555555555555555555555555555555555555' as Address,
  },
  metadata: {
    decimals: 6,
    name: 'USD Coin',
    symbol: 'USDC',
  },
  type: 'erc20',
}

/**
 * Mock WETH asset for testing.
 * Uses the standard OP Stack WETH predeploy address on all chains.
 */
export const MockWETHAsset: Asset = {
  address: {
    [optimism.id]: '0x4200000000000000000000000000000000000006' as Address,
    [base.id]: '0x4200000000000000000000000000000000000006' as Address,
    [baseSepolia.id]: '0x4200000000000000000000000000000000000006' as Address,
    [unichain.id]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
    [mode.id]: '0x4200000000000000000000000000000000000006' as Address,
  },
  metadata: {
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH',
  },
  type: 'erc20',
}

/**
 * Mock OP token for testing.
 */
export const MockOPAsset: Asset = {
  address: {
    [optimism.id]: '0x4200000000000000000000000000000000000042' as Address,
  },
  metadata: {
    decimals: 18,
    name: 'Optimism',
    symbol: 'OP',
  },
  type: 'erc20',
}

/**
 * Mock native ETH asset for testing.
 */
export const MockETHAsset: Asset = {
  address: {
    [optimism.id]: 'native',
    [base.id]: 'native',
    [baseSepolia.id]: 'native',
  },
  metadata: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  type: 'native',
}

/** Standard test wallet address */
export const MOCK_WALLET =
  '0x000000000000000000000000000000000000dEaD' as Address

/** Standard mock pool address */
export const MOCK_POOL = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' as Address

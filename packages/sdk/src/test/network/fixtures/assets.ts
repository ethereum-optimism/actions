import type { Address } from 'viem'
import { base, mainnet, optimism } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

export const MAINNET_USDC: Asset = {
  type: 'erc20',
  address: {
    [mainnet.id]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as Address,
  },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

export const MAINNET_WETH: Asset = {
  type: 'erc20',
  address: {
    [mainnet.id]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as Address,
  },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

export const OP_USDC: Asset = {
  type: 'erc20',
  address: {
    [optimism.id]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as Address,
  },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

export const OP_WETH: Asset = {
  type: 'erc20',
  address: {
    [optimism.id]: '0x4200000000000000000000000000000000000006' as Address,
  },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

export const OP_OP: Asset = {
  type: 'erc20',
  address: {
    [optimism.id]: '0x4200000000000000000000000000000000000042' as Address,
  },
  metadata: { name: 'Optimism', symbol: 'OP', decimals: 18 },
}

export const BASE_USDC: Asset = {
  type: 'erc20',
  address: {
    [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address,
  },
  metadata: { name: 'USD Coin', symbol: 'USDC', decimals: 6 },
}

export const BASE_WETH: Asset = {
  type: 'erc20',
  address: {
    [base.id]: '0x4200000000000000000000000000000000000006' as Address,
  },
  metadata: { name: 'Wrapped Ether', symbol: 'WETH', decimals: 18 },
}

export const MAINNET_WBTC: Asset = {
  type: 'erc20',
  address: {
    [mainnet.id]: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' as Address,
  },
  metadata: { name: 'Wrapped Bitcoin', symbol: 'WBTC', decimals: 8 },
}

/**
 * Known whale addresses for impersonation-based ERC20 funding on Anvil forks.
 * These are high-balance holders that are unlikely to move all funds.
 */
export const WHALES: Partial<
  Record<SupportedChainId, Record<string, Address>>
> = {
  [mainnet.id]: {
    USDC: '0x37305B1cD40574E4C5Ce33f8e8306Be057fD7341', // Circle reserve
  },
  [optimism.id]: {
    USDC: '0xEbe80f029b1c02862B9E8a70a7e5317C06F62Cae', // Optimism bridge
  },
  [base.id]: {
    USDC: '0x20FE51A9229EEf2cF8Ad9E89d91CAb9312cF3b7A', // Base bridge
  },
}

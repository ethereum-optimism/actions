import {
  base,
  baseSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  sepolia,
  unichain,
  unichainSepolia,
  worldchain,
} from 'viem/chains'

import type { Asset } from '@/types/asset.js'

export const ETH: Asset = {
  address: {
    [mainnet.id]: 'native',
    [sepolia.id]: 'native',
    [optimism.id]: 'native',
    [optimismSepolia.id]: 'native',
    [base.id]: 'native',
    [baseSepolia.id]: 'native',
    [unichain.id]: 'native',
    [unichainSepolia.id]: 'native',
  },
  metadata: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  type: 'native',
}

/**
 * Wrapped ETH token definition
 * @description WETH is the ERC-20 wrapped version of native ETH
 */
export const WETH: Asset = {
  address: {
    [mainnet.id]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    [sepolia.id]: '0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9',
    [optimism.id]: '0x4200000000000000000000000000000000000006',
    [optimismSepolia.id]: '0x4200000000000000000000000000000000000006',
    [base.id]: '0x4200000000000000000000000000000000000006',
    [baseSepolia.id]: '0x4200000000000000000000000000000000000006',
    [unichain.id]: '0x4200000000000000000000000000000000000006',
    [unichainSepolia.id]: '0x4200000000000000000000000000000000000006',
  },
  metadata: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
  type: 'erc20',
}

/**
 * USDC stablecoin definition
 * @description Official Circle USDC addresses for Superchain networks
 * @see https://developers.circle.com/stablecoins/usdc-contract-addresses
 */
export const USDC: Asset = {
  address: {
    [mainnet.id]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    [sepolia.id]: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    [optimism.id]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    [optimismSepolia.id]: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    [base.id]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    [unichain.id]: '0x078D782b760474a361dDA0AF3839290b0EF57AD6',
    [unichainSepolia.id]: '0x31d0220469e10c4E71834a79b1f276d740d3768F',
    [worldchain.id]: '0x79A02482A880bCe3F13E09da970dC34dB4cD24D1',
  },
  metadata: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  type: 'erc20',
}

/**
 * Demo USDC token for testing
 */
export const USDC_DEMO: Asset = {
  address: {
    [baseSepolia.id]: '0xb1b0FE886cE376F28987Ad24b1759a8f0A7dd839',
  },
  metadata: {
    symbol: 'USDC_DEMO',
    name: 'USDC',
    decimals: 6,
  },
  type: 'erc20',
}

/**
 * Morpho Token
 */
export const MORPHO: Asset = {
  address: {
    [mainnet.id]: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2',
    [base.id]: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
  },
  metadata: {
    symbol: 'MORPHO',
    name: 'Morpho Token',
    decimals: 18,
  },
  type: 'erc20',
}

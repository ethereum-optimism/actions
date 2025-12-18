import type { Asset } from '@eth-optimism/actions-sdk'
import {
  base,
  baseSepolia,
  mainnet,
  optimismSepolia,
  unichain,
} from 'viem/chains'

export const USDC: Asset = {
  address: {
    [mainnet.id]: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    [unichain.id]: '0x078d782b760474a361dda0af3839290b0ef57ad6',
    [baseSepolia.id]: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  metadata: {
    decimals: 6,
    name: 'USDC',
    symbol: 'USDC',
  },
  type: 'erc20',
}

export const USDC_DEMO: Asset = {
  address: {
    [baseSepolia.id]: '0xb1b0FE886cE376F28987Ad24b1759a8f0A7dd839',
  },
  metadata: {
    decimals: 6,
    name: 'USDC',
    symbol: 'USDC_DEMO',
  },
  type: 'erc20',
}

export const MORPHO: Asset = {
  address: {
    [mainnet.id]: '0x58D97B57BB95320F9a05dC918Aef65434969c2B2',
    [base.id]: '0xBAa5CC21fd487B8Fcc2F632f3F4E8D37262a0842',
  },
  metadata: {
    decimals: 18,
    name: 'Morpho Token',
    symbol: 'MORPHO',
  },
  type: 'erc20',
}

export const WETH: Asset = {
  address: {
    [optimismSepolia.id]: '0x4200000000000000000000000000000000000006',
  },
  metadata: {
    decimals: 18,
    name: 'Wrapped Ether',
    symbol: 'WETH',
  },
  type: 'erc20',
}

import type { Asset } from '@eth-optimism/verbs-sdk'
import { base, baseSepolia, mainnet, unichain } from 'viem/chains'

export const ETH: Asset = {
  address: {
    [mainnet.id]: 'native',
    [unichain.id]: 'native',
    [base.id]: 'native',
    [baseSepolia.id]: 'native',
  },
  metadata: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  type: 'native',
}

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
    [baseSepolia.id]: '0x87c25229afbc30418d0144e8dfb2bcf8efd92c6c',
  },
  metadata: {
    decimals: 6,
    name: 'USDC Demo',
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

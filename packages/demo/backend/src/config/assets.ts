import type { Asset } from '@eth-optimism/actions-sdk'
import { baseSepolia } from 'viem/chains'

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

export const OP_DEMO: Asset = {
  address: {
    [baseSepolia.id]: '0x0000000000000000000000000000000000000000',
  },
  metadata: {
    decimals: 18,
    name: 'OP',
    symbol: 'OP_DEMO',
  },
  type: 'erc20',
}

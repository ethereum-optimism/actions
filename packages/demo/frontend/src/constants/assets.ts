import type { Asset } from '@eth-optimism/actions-sdk/react'
import { baseSepolia, optimismSepolia } from 'viem/op-stack'

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

export const WETH: Asset = {
  address: {
    [optimismSepolia.id]: '0x4200000000000000000000000000000000000006',
  },
  metadata: {
    decimals: 18,
    name: 'ETH',
    symbol: 'WETH',
  },
  type: 'erc20',
}

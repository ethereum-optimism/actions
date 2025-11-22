import type { Asset } from '@eth-optimism/actions-sdk/react'
import { baseSepolia } from 'viem/op-stack'

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

import { getTokenBySymbol, type Asset } from '@eth-optimism/actions-sdk/react'
import { optimismSepolia } from 'viem/op-stack'

export const USDC_DEMO = getTokenBySymbol('USDC_DEMO')!

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

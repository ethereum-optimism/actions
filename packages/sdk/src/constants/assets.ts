import {
  base,
  baseSepolia,
  mainnet,
  optimismSepolia,
  unichain,
} from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

export const ETH: Asset = {
  address: {
    [mainnet.id]: 'native',
    [unichain.id]: 'native',
    [base.id]: 'native',
    [baseSepolia.id]: 'native',
    [optimismSepolia.id]: 'native',
  } satisfies Record<SupportedChainId, 'native'>,
  metadata: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  type: 'native',
}

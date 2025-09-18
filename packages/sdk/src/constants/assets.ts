import type { Address } from 'viem'
import { base, baseSepolia, mainnet, unichain } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

export const ETH: Asset = {
  address: {
    [mainnet.id]: '0x0000000000000000000000000000000000000000',
    [unichain.id]: '0x0000000000000000000000000000000000000000',
    [base.id]: '0x0000000000000000000000000000000000000000',
    [baseSepolia.id]: '0x0000000000000000000000000000000000000000',
  } satisfies Record<SupportedChainId, Address>,
  metadata: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  type: 'native',
}

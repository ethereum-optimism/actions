import {
  base,
  baseSepolia,
  mainnet,
  optimism,
  optimismSepolia,
  unichain,
} from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { Asset } from '@/types/asset.js'

export const ETH: Asset = {
  address: {
    [mainnet.id]: 'native',
    [optimism.id]: 'native',
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

/**
 * Wrapped ETH token definition
 * @description WETH is the ERC-20 wrapped version of native ETH
 */
export const WETH: Asset = {
  address: {
    [mainnet.id]: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    [optimism.id]: '0x4200000000000000000000000000000000000006',
    [optimismSepolia.id]: '0x4200000000000000000000000000000000000006',
    [base.id]: '0x4200000000000000000000000000000000000006',
    [baseSepolia.id]: '0x4200000000000000000000000000000000000006',
    [unichain.id]: '0x4200000000000000000000000000000000000006',
  },
  metadata: {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
  },
  type: 'erc20',
}

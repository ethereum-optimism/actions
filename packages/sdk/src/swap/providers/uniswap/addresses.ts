import type { Address } from 'viem'
import {
  base,
  baseSepolia,
  mainnet,
  optimism,
  sepolia,
  unichain,
  unichainSepolia,
  worldchain,
} from 'viem/chains'

import { PERMIT2_ADDRESS } from '@/constants/contracts.js'
import type { SupportedChainId } from '@/constants/supportedChains.js'
import { validateAddressMap } from '@/utils/validateAddresses.js'

/**
 * Uniswap contract addresses
 */
export interface UniswapAddresses {
  poolManager: Address
  positionManager: Address
  universalRouter: Address
  quoter: Address
  permit2: Address
}

/**
 * Uniswap V4 contract addresses per chain
 * @see https://docs.uniswap.org/contracts/v4/deployments
 */
const UNISWAP_ADDRESSES: Partial<Record<SupportedChainId, UniswapAddresses>> =
  validateAddressMap({
    [mainnet.id]: {
      poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
      positionManager: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
      universalRouter: '0x66a9893cc07d91d95644aedd05d03f95e1dba8af',
      quoter: '0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203',
      permit2: PERMIT2_ADDRESS,
    },
    [optimism.id]: {
      poolManager: '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3',
      positionManager: '0x3c3ea4b57a46241e54610e5f022e5c45859a1017',
      universalRouter: '0x851116d9223fabed8e56c0e6b8ad0c31d98b3507',
      quoter: '0x1f3131a13296fb91c90870043742c3cdbff1a8d7',
      permit2: PERMIT2_ADDRESS,
    },
    [base.id]: {
      poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
      positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
      universalRouter: '0x6ff5693b99212da76ad316178a184ab56d299b43',
      quoter: '0x0d5e0f971ed27fbff6c2837bf31316121532048d',
      permit2: PERMIT2_ADDRESS,
    },
    [unichain.id]: {
      poolManager: '0x1f98400000000000000000000000000000000004',
      positionManager: '0x4529a01c7a0410167c5740c487a8de60232617bf',
      universalRouter: '0xef740bf23acae26f6492b10de645d6b98dc8eaf3',
      quoter: '0x333e3c607b141b18ff6de9f258db6e77fe7491e0',
      permit2: PERMIT2_ADDRESS,
    },
    [worldchain.id]: {
      poolManager: '0xb1860d529182ac3bc1f51fa2abd56662b7d13f33',
      positionManager: '0xc585e0f504613b5fbf874f21af14c65260fb41fa',
      universalRouter: '0x8ac7bee993bb44dab564ea4bc9ea67bf9eb5e743',
      quoter: '0x55d235b3ff2daf7c3ede0defc9521f1d6fe6c5c0',
      permit2: PERMIT2_ADDRESS,
    },
    [sepolia.id]: {
      poolManager: '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
      positionManager: '0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4',
      universalRouter: '0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b',
      quoter: '0x61b3f2011a92d183c7dbadbda940a7555ccf9227',
      permit2: PERMIT2_ADDRESS,
    },
    [baseSepolia.id]: {
      poolManager: '0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408',
      positionManager: '0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80',
      universalRouter: '0x492e6456d9528771018deb9e87ef7750ef184104',
      quoter: '0x4a6513c898fe1b2d0e78d3b0e0a4a151589b1cba',
      permit2: PERMIT2_ADDRESS,
    },
    [unichainSepolia.id]: {
      poolManager: '0x00b036b58a818b1bc34d502d3fe730db729e62ac',
      positionManager: '0xf969aee60879c54baaed9f3ed26147db216fd664',
      universalRouter: '0xf70536b3bcc1bd1a972dc186a2cf84cc6da6be5d',
      quoter: '0x56dcd40a3f2d466f48e7f48bdbe5cc9b92ae4472',
      permit2: PERMIT2_ADDRESS,
    },
  })

/**
 * Get Uniswap contract addresses for a chain
 */
export function getUniswapAddresses(
  chainId: SupportedChainId,
): UniswapAddresses {
  const addresses = UNISWAP_ADDRESSES[chainId]
  if (!addresses) {
    throw new Error(`Uniswap not supported on chain ${chainId}`)
  }
  return addresses
}

/**
 * Get supported chain IDs for Uniswap
 */
export function getSupportedChainIds(): SupportedChainId[] {
  return Object.keys(UNISWAP_ADDRESSES).map(Number) as SupportedChainId[]
}

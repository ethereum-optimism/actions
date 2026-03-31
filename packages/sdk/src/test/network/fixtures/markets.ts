import type { Address } from 'viem'
import { base, mainnet, optimism } from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { VelodromeMarketConfig } from '@/swap/providers/velodrome/types.js'
import type { LendMarketConfig } from '@/types/lend/index.js'

import {
  BASE_USDC,
  BASE_WETH,
  MAINNET_USDC,
  MAINNET_WBTC,
  OP_OP,
  OP_USDC,
  OP_WETH,
} from './assets.js'

/**
 * Pinned Velodrome/Aerodrome market configs for network tests.
 * One canonical market per router-type + chain combo.
 */
export const VELODROME_MARKETS: Array<{
  name: string
  chainId: SupportedChainId
  config: VelodromeMarketConfig
}> = [
  {
    name: 'OP v2 USDC/OP volatile',
    chainId: optimism.id as SupportedChainId,
    config: {
      assets: [OP_USDC, OP_OP],
      stable: false,
      chainId: optimism.id as SupportedChainId,
    },
  },
  {
    name: 'OP v2 USDC/WETH volatile',
    chainId: optimism.id as SupportedChainId,
    config: {
      assets: [OP_USDC, OP_WETH],
      stable: false,
      chainId: optimism.id as SupportedChainId,
    },
  },
  {
    name: 'OP CL USDC/WETH',
    chainId: optimism.id as SupportedChainId,
    config: {
      assets: [OP_USDC, OP_WETH],
      tickSpacing: 100,
      chainId: optimism.id as SupportedChainId,
    },
  },
  {
    name: 'Base v2 USDC/WETH volatile',
    chainId: base.id as SupportedChainId,
    config: {
      assets: [BASE_USDC, BASE_WETH],
      stable: false,
      chainId: base.id as SupportedChainId,
    },
  },
  {
    name: 'Base CL USDC/WETH',
    chainId: base.id as SupportedChainId,
    config: {
      assets: [BASE_USDC, BASE_WETH],
      tickSpacing: 100,
      chainId: base.id as SupportedChainId,
    },
  },
]

/**
 * Pinned Morpho MetaMorpho vault addresses for deterministic network tests.
 * These are high-TVL vaults from well-known curators that are unlikely to disappear.
 * @see https://app.morpho.org/
 */
export const MORPHO_VAULTS: Record<string, LendMarketConfig> = {
  mainnetGauntletUSDC: {
    address: '0xdd0f28e19C1f9D5c1b1085d0e21F8164631aff12' as Address,
    chainId: mainnet.id as SupportedChainId,
    name: 'Gauntlet USDC Core',
    asset: MAINNET_USDC,
    lendProvider: 'morpho',
  },
  mainnetGauntletWBTC: {
    address: '0x443df5eEE3196e9b2Dd77CaBd3eA76C3dee8f9b2' as Address,
    chainId: mainnet.id as SupportedChainId,
    name: 'Gauntlet WBTC Core',
    asset: MAINNET_WBTC,
    lendProvider: 'morpho',
  },
  baseGauntletUSDC: {
    address: '0xc0c5689E6f4D256E861F65465b691aeEcC0dEb12' as Address,
    chainId: base.id as SupportedChainId,
    name: 'Gauntlet USDC Prime',
    asset: BASE_USDC,
    lendProvider: 'morpho',
  },
  opSteakhouseUSDC: {
    address: '0x0DB2B41f48A9bDB0aF3D37C4f8d8e37583A3f729' as Address,
    chainId: optimism.id as SupportedChainId,
    name: 'Steakhouse USDC',
    asset: OP_USDC,
    lendProvider: 'morpho',
  },
}

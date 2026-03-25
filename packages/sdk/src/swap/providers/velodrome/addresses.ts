import type { Address } from 'viem'
import {
  base,
  baseSepolia,
  bob,
  celo,
  fraxtal,
  ink,
  lisk,
  metalL2,
  mode,
  optimism,
  soneium,
  superseed,
  unichain,
} from 'viem/chains'

import type { SupportedChainId } from '@/constants/supportedChains.js'

/** Router contract variant: v2 (legacy), leaf (relay chains), universal (new) */
export type VelodromeRouterType = 'v2' | 'leaf' | 'universal'

/**
 * Contract addresses deployed on a single chain.
 * Keys match official Velodrome/Aerodrome contract names.
 */
export interface VelodromeContracts {
  /** Router — swaps and liquidity operations */
  router: Address
  /** PoolFactory — creates v2 AMM pools (volatile/stable) */
  poolFactory: Address
  /** CL/Slipstream PoolFactory — creates concentrated liquidity pools */
  clPoolFactory?: Address
  /** CL/Slipstream QuoterV2 — off-chain swap simulation for CL pools */
  clQuoterV2?: Address
}

/**
 * Per-chain Velodrome/Aerodrome configuration.
 * Structured as { contracts, metadata } for clean separation of
 * validated addresses from provider-specific configuration.
 */
export interface VelodromeChainConfig {
  contracts: VelodromeContracts
  metadata: {
    routerType: VelodromeRouterType
  }
}

/**
 * Velodrome/Aerodrome chain configurations.
 *
 * Hub chains (Optimism, Base) use v2 routers with factory-aware Route structs.
 * Leaf chains use the Relay router with simplified Route structs.
 * @see https://velodrome.finance/docs
 * @see https://aerodrome.finance/docs
 */
export const VELODROME_CHAINS: Partial<
  Record<SupportedChainId, VelodromeChainConfig>
> = {
  [baseSepolia.id]: {
    contracts: {
      router: '0x4b94B729d6183c9efD0071f0790e984bAF46E093',
      poolFactory: '0x7b9644D43900da734f5a83DD0489Af1197DF2CF0',
    },
    metadata: { routerType: 'universal' },
  },
  [optimism.id]: {
    contracts: {
      router: '0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858',
      poolFactory: '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a',
      clPoolFactory: '0xCc0bDDB707055e04e497aB22a59c2aF4391cd12F',
      clQuoterV2: '0x89D8218ed5fF1e46d8dcd33fb0bbeE3be1621466',
    },
    metadata: { routerType: 'v2' },
  },
  [base.id]: {
    contracts: {
      router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
      poolFactory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
      clPoolFactory: '0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A',
      clQuoterV2: '0x254cF9E1E6e233aa1AC962CB9B05b2cfeAaE15b0',
    },
    metadata: { routerType: 'v2' },
  },
  [bob.id]: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
  [celo.id]: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
  [fraxtal.id]: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
  [ink.id]: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
  [lisk.id]: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
  [metalL2.id]: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
  [mode.id]: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
  [soneium.id]: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
  [superseed.id]: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
  // Swell — not available in viem/chains
  1923: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
  [unichain.id]: {
    contracts: {
      router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
      poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    },
    metadata: { routerType: 'leaf' },
  },
}

/**
 * Get Velodrome/Aerodrome chain config including contracts and metadata.
 * @throws If chain is not supported
 */
export function getVelodromeConfig(
  chainId: SupportedChainId,
): VelodromeChainConfig {
  const config = VELODROME_CHAINS[chainId]
  if (!config) {
    throw new Error(`Velodrome/Aerodrome not supported on chain ${chainId}`)
  }
  return config
}

/**
 * Get all chain IDs where Velodrome/Aerodrome is deployed
 */
export function getSupportedChainIds(): SupportedChainId[] {
  return Object.keys(VELODROME_CHAINS).map(Number) as SupportedChainId[]
}

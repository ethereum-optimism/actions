import type { Address } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'

/** Router contract variant */
export type VelodromeRouterType = 'v2' | 'leaf'

/**
 * Velodrome/Aerodrome contract addresses for a chain
 */
export interface VelodromeAddresses {
  router: Address
  poolFactory: Address
  routerType: VelodromeRouterType
}

/**
 * Velodrome/Aerodrome contract addresses per chain.
 *
 * Hub chains (Optimism, Base) use v2 routers with factory-aware Route structs.
 * Leaf chains use the Relay leaf router with simplified Route structs.
 * @see https://velodrome.finance/docs
 * @see https://aerodrome.finance/docs
 */
const VELODROME_ADDRESSES: Partial<
  Record<SupportedChainId, VelodromeAddresses>
> = {
  // Optimism — Velodrome v2
  10: {
    router: '0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858',
    poolFactory: '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a',
    routerType: 'v2',
  },
  // Base — Aerodrome v2
  8453: {
    router: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    poolFactory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    routerType: 'v2',
  },
  // Bob
  60808: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
  // Celo
  42220: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
  // Fraxtal
  252: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
  // Ink
  57073: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
  // Lisk
  1135: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
  // Metal
  1750: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
  // Mode
  34443: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
  // Soneium
  1868: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
  // Superseed
  5330: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
  // Swell
  1923: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
  // Unichain
  130: {
    router: '0x3a63171DD9BebF4D07BC782FECC7eb0b890C2A45',
    poolFactory: '0x31832f2a97Fd20664D76Cc421207669b55CE4BC0',
    routerType: 'leaf',
  },
}

/**
 * Get Velodrome/Aerodrome contract addresses for a chain
 * @param chainId - Target chain ID
 * @returns Contract addresses and router type
 * @throws If chain is not supported
 */
export function getVelodromeAddresses(
  chainId: SupportedChainId,
): VelodromeAddresses {
  const addresses = VELODROME_ADDRESSES[chainId]
  if (!addresses) {
    throw new Error(`Velodrome/Aerodrome not supported on chain ${chainId}`)
  }
  return addresses
}

/**
 * Get all chain IDs where Velodrome/Aerodrome is deployed
 */
export function getSupportedChainIds(): SupportedChainId[] {
  return Object.keys(VELODROME_ADDRESSES).map(Number) as SupportedChainId[]
}

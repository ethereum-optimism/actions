/**
 * Reads an ERC-4626 vault's `convertToAssets` to turn raw collateral shares
 * into underlying-asset units. The SDK borrow provider returns raw shares; the
 * demo converts them client-side because vault-wrapped collateral is demo-only.
 */

import {
  type Address,
  createPublicClient,
  erc4626Abi,
  http,
  type PublicClient,
} from 'viem'
import { baseSepolia, optimismSepolia } from 'viem/chains'
import { env } from '@/envVars'

const CHAINS = {
  [baseSepolia.id]: {
    chain: baseSepolia,
    rpcUrl: env.VITE_BASE_SEPOLIA_RPC_URL,
  },
  [optimismSepolia.id]: {
    chain: optimismSepolia,
    rpcUrl: env.VITE_OP_SEPOLIA_RPC_URL,
  },
} as const

const clients = new Map<number, PublicClient>()

function getPublicClient(chainId: number): PublicClient {
  const cached = clients.get(chainId)
  if (cached) return cached
  const entry = CHAINS[chainId as keyof typeof CHAINS]
  if (!entry) throw new Error(`Unsupported chain for vault read: ${chainId}`)
  // Falls back to the chain's default public RPC when no URL is configured.
  const client = createPublicClient({
    chain: entry.chain,
    transport: http(entry.rpcUrl),
  }) as PublicClient
  clients.set(chainId, client)
  return client
}

/** Underlying-asset value of `shares` held in the given ERC-4626 vault. */
export async function fetchCollateralUnderlying(
  vault: Address,
  shares: bigint,
  chainId: number,
): Promise<bigint> {
  if (shares <= 0n) return 0n
  return getPublicClient(chainId).readContract({
    address: vault,
    abi: erc4626Abi,
    functionName: 'convertToAssets',
    args: [shares],
  })
}

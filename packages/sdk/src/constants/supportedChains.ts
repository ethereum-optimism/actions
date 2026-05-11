import type { Chain } from 'viem'
import {
  base,
  baseSepolia,
  bob,
  celo,
  fraxtal,
  ink,
  lisk,
  mainnet,
  metalL2,
  mode,
  optimism,
  optimismSepolia,
  sepolia,
  soneium,
  superseed,
  swellchain,
  unichain,
  unichainSepolia,
  worldchain,
} from 'viem/chains'

const slug = (name: string): string => name.toLowerCase().replace(/\s+/g, '-')

/**
 * Single source of truth for the chains the SDK supports. All other
 * chain-related constants in this module are derived from this list.
 */
const SUPPORTED_CHAINS_TUPLE = [
  mainnet,
  sepolia,
  optimism,
  optimismSepolia,
  base,
  baseSepolia,
  unichain,
  unichainSepolia,
  worldchain,
  bob,
  celo,
  fraxtal,
  ink,
  lisk,
  metalL2,
  mode,
  soneium,
  superseed,
  swellchain,
] as const

const SUPPORTED_CHAINS: readonly Chain[] = SUPPORTED_CHAINS_TUPLE

export type SupportedChainId = (typeof SUPPORTED_CHAINS_TUPLE)[number]['id']

export const SUPPORTED_CHAIN_IDS = SUPPORTED_CHAINS.map(
  (c) => c.id,
) as readonly SupportedChainId[]

/**
 * Extra names that resolve to a chain in addition to its canonical
 * `slug(chain.name)`. Add entries here only when there's a shorter or
 * more familiar name worth accepting alongside the viem one.
 */
const EXTRA_CHAIN_ALIASES: Partial<
  Record<SupportedChainId, readonly string[]>
> = {
  [mainnet.id]: ['mainnet'], // viem: 'ethereum'
  [optimism.id]: ['optimism'], // viem: 'op-mainnet'
  [worldchain.id]: ['worldchain'], // viem: 'world-chain'
  [metalL2.id]: ['metal'], // viem: 'metal-l2'
  [mode.id]: ['mode'], // viem: 'mode-mainnet'
  [soneium.id]: ['soneium'], // viem: 'soneium-mainnet'
  [swellchain.id]: ['swell'], // viem: 'swellchain'
}

/**
 * Canonical CLI / human-friendly shortname for each supported chain:
 * `slug(chain.name)` (e.g. `base-sepolia`, `ethereum`, `op-mainnet`).
 * Use this for display. For input parsing prefer `chainIdFromShortname`,
 * which also accepts entries from `EXTRA_CHAIN_ALIASES`.
 */
export const SUPPORTED_CHAIN_SHORTNAMES: Record<SupportedChainId, string> =
  Object.fromEntries(
    SUPPORTED_CHAINS.map((chain) => [chain.id, slug(chain.name)]),
  ) as Record<SupportedChainId, string>

const NAME_TO_ID: Record<string, SupportedChainId> = (() => {
  const index: Record<string, SupportedChainId> = {}
  for (const chain of SUPPORTED_CHAINS) {
    const id = chain.id as SupportedChainId
    index[SUPPORTED_CHAIN_SHORTNAMES[id]] = id
    for (const alias of EXTRA_CHAIN_ALIASES[id] ?? []) index[alias] = id
  }
  return index
})()

/**
 * Resolve a user-typed chain name to a `SupportedChainId`. Accepts both
 * the canonical shortname (`mainnet`, `optimism`) and the viem `chain.name`
 * slug (`ethereum`, `op-mainnet`). Case-insensitive. Returns `undefined`
 * for unknown names.
 */
export function chainIdFromShortname(
  name: string,
): SupportedChainId | undefined {
  return NAME_TO_ID[name.toLowerCase()]
}

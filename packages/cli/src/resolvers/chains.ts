import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import {
  base,
  baseSepolia,
  optimism,
  optimismSepolia,
  unichain,
  unichainSepolia,
} from 'viem/chains'

import { CliError } from '@/output/errors.js'

const SHORTNAMES: Record<string, SupportedChainId> = {
  base: base.id,
  'base-sepolia': baseSepolia.id,
  optimism: optimism.id,
  'op-sepolia': optimismSepolia.id,
  unichain: unichain.id,
  'unichain-sepolia': unichainSepolia.id,
}

const CHAIN_IDS: Record<number, string> = Object.fromEntries(
  Object.entries(SHORTNAMES).map(([name, id]) => [id, name]),
)

/**
 * @description Resolves a chain shortname (e.g. `base-sepolia`) to a
 * `SupportedChainId`. Restricted to the configured chain set so unknown
 * shortnames or chains not in the active config surface as validation
 * errors before the SDK sees them. Match is case-insensitive.
 * @param shortname - User-provided chain shortname from CLI argv.
 * @param configuredChainIds - Chain IDs present in the resolved config.
 * @returns The matching `SupportedChainId`.
 * @throws `CliError` with code `validation` when the shortname is unknown
 * or maps to a chain not present in `configuredChainIds`.
 */
export function resolveChain(
  shortname: string,
  configuredChainIds: readonly SupportedChainId[],
): SupportedChainId {
  const id = SHORTNAMES[shortname.toLowerCase()]
  if (id === undefined || !configuredChainIds.includes(id)) {
    throw new CliError('validation', `Unknown chain: ${shortname}`, {
      chain: shortname,
      allowed: configuredChainIds
        .map((cid) => CHAIN_IDS[cid])
        .filter((name): name is string => name !== undefined),
    })
  }
  return id
}

/**
 * @description Inverse of `resolveChain` - maps a `SupportedChainId` back
 * to its canonical shortname. Used by the `chains` command to render the
 * configured chain set. The round-trip
 * `shortnameFor(resolveChain(name)) === name` holds for every name in the
 * resolver's map.
 * @param chainId - A `SupportedChainId` present in the resolver map.
 * @returns The chain's canonical shortname.
 * @throws `CliError` with code `validation` when the chain has no shortname.
 */
export function shortnameFor(chainId: SupportedChainId): string {
  const name = CHAIN_IDS[chainId]
  if (!name) {
    throw new CliError('validation', `No shortname for chainId: ${chainId}`, {
      chainId,
    })
  }
  return name
}

/**
 * @description Parses a raw `--chain-id` flag value and validates it is
 * present in the configured chain set.
 * @param raw - The flag value as passed on argv.
 * @param configuredChainIds - Chain IDs in the resolved config.
 * @returns The validated `SupportedChainId`.
 * @throws `CliError` with code `validation` when the value is not a
 * positive integer or is not present in `configuredChainIds`.
 */
export function resolveChainId(
  raw: string,
  configuredChainIds: readonly SupportedChainId[],
): SupportedChainId {
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError(
      'validation',
      `Invalid --chain-id: ${raw} (expected a positive integer)`,
      { chainId: raw },
    )
  }
  if (!configuredChainIds.includes(parsed as SupportedChainId)) {
    throw new CliError('validation', `Chain ${parsed} is not configured`, {
      chainId: parsed,
      allowed: configuredChainIds,
    })
  }
  return parsed as SupportedChainId
}

export interface ChainFlags {
  chain?: string
  chainId?: string
}

/**
 * @description Resolves the mutually-exclusive `--chain` / `--chain-id`
 * option pair into a single `SupportedChainId`, or `undefined` when
 * neither is provided. Callers apply the "undefined = no filter"
 * convention as they see fit.
 * @param flags - Parsed commander options; either flag may be set.
 * @param configuredChainIds - Chain IDs in the resolved config.
 * @returns The selected chain id, or `undefined` if neither flag was used.
 * @throws `CliError` with code `validation` when both flags are set or
 * when the provided value is unknown.
 */
export function resolveChainFlags(
  flags: ChainFlags,
  configuredChainIds: readonly SupportedChainId[],
): SupportedChainId | undefined {
  const { chain, chainId } = flags
  if (chain && chainId) {
    throw new CliError(
      'validation',
      'Pass either --chain or --chain-id, not both',
      { chain, chainId },
    )
  }
  if (chain) return resolveChain(chain, configuredChainIds)
  if (chainId) return resolveChainId(chainId, configuredChainIds)
  return undefined
}

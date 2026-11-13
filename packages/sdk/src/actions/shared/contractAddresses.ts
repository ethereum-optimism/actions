import type { Address } from 'viem'

/** Placeholder metadata for providers with no non-address chain settings. */
export const EMPTY_METADATA = {} as const

/** Metadata type for providers that only store contract addresses. */
export type EmptyProviderMetadata = typeof EMPTY_METADATA

/**
 * Wrap addresses in the standard `{ contracts, metadata }` chain config.
 * @description Use when a provider has no metadata yet. Keeping the object
 * present makes the address map self-describing and keeps non-address
 * settings out of address validation.
 * @param contracts - Named contract addresses for one chain.
 * @returns Chain config with those addresses and empty metadata.
 */
export function withEmptyMetadata<TContracts extends object>(
  contracts: TContracts,
): { contracts: TContracts; metadata: EmptyProviderMetadata } {
  return { contracts, metadata: EMPTY_METADATA }
}

function isAddressValue(value: unknown): value is Address {
  return typeof value === 'string' && value.startsWith('0x')
}

function contractList(contracts: object): Address[] {
  const values: unknown[] = Object.values(contracts)
  return values.filter(isAddressValue)
}

function isChainConfig(value: unknown): value is { contracts: object } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'contracts' in value &&
    typeof value.contracts === 'object' &&
    value.contracts !== null
  )
}

/**
 * Collect deployed contract addresses from a `{ contracts, metadata }` registry.
 * @description Skips unset optional contract slots. Metadata is ignored so
 * non-address settings cannot fail address validation.
 * @param chains - Provider chain registry keyed by chain id.
 * @returns Map of chain id to the addresses stored under `contracts`.
 */
export function collectContractAddresses(
  chains: object,
): Record<number, Address[]> {
  const addresses: Record<number, Address[]> = {}
  for (const [chainId, config] of Object.entries(chains)) {
    if (!isChainConfig(config)) continue
    addresses[Number(chainId)] = contractList(config.contracts)
  }
  return addresses
}

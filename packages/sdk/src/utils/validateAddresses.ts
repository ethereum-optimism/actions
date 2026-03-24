import type { Address } from 'viem'
import { getAddress } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { AssetsConfig, LendConfig, SwapConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type { LendProviderConfig } from '@/types/lend/index.js'
import type { SwapProviderConfig } from '@/types/swap/index.js'

type NamedAddresses = Record<string, Address>

/**
 * Validates all values in an address map.
 * Values may be a single Address or a record of named addresses.
 * Collects all failures before throwing a single Error listing every invalid entry.
 * @returns The original map reference if all addresses are valid.
 * @throws Error listing all invalid addresses with their chain IDs and key names.
 */
export function validateAddressMap<
  M extends Partial<Record<number, Address | NamedAddresses>>,
>(map: M): M {
  const errors: string[] = []

  for (const [chainId, value] of Object.entries(map)) {
    if (value === undefined) continue
    if (typeof value === 'string') {
      try {
        getAddress(value)
      } catch {
        errors.push(
          `  - address on chain ${chainId}: ${value} (not a valid EVM address)`,
        )
      }
    } else {
      for (const [key, addr] of Object.entries(value as NamedAddresses)) {
        try {
          getAddress(addr)
        } catch {
          errors.push(
            `  - ${key} on chain ${chainId}: ${addr} (not a valid EVM address)`,
          )
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid addresses found:\n${errors.join('\n')}`)
  }
  return map
}

/**
 * Validates a Partial<Record<SupportedChainId, Address | 'native'>> asset address map.
 * Skips entries where the value is 'native'.
 * Collects all failures before throwing a single Error.
 * @returns The original map if all non-native addresses are valid.
 * @throws Error listing all invalid addresses with their chain IDs.
 */
export function validateAssetAddresses(
  map: Partial<Record<SupportedChainId, Address | 'native'>>,
): Partial<Record<SupportedChainId, Address | 'native'>> {
  const errors: string[] = []

  for (const [chainId, value] of Object.entries(map)) {
    if (value === undefined || value === 'native') continue
    try {
      getAddress(value)
    } catch {
      errors.push(`  - chain ${chainId}: ${value} (not a valid EVM address)`)
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid addresses found:\n${errors.join('\n')}`)
  }
  return map
}

interface AddressEntry {
  path: string
  value: string
}

function assetAddresses(asset: Asset, path: string): AddressEntry[] {
  return Object.entries(asset.address)
    .filter(([, addr]) => addr !== 'native')
    .map(([chainId, addr]) => ({
      path: `${path}.address[${chainId}]`,
      value: addr as string,
    }))
}

function lendProviderAddresses(
  config: LendProviderConfig,
  providerPath: string,
): AddressEntry[] {
  return (['marketAllowlist', 'marketBlocklist'] as const).flatMap((key) =>
    (config[key] ?? []).flatMap((m, i) => [
      { path: `${providerPath}.${key}[${i}].address`, value: m.address },
      ...assetAddresses(m.asset, `${providerPath}.${key}[${i}].asset`),
    ]),
  )
}

function swapProviderAddresses(
  config: SwapProviderConfig,
  providerPath: string,
): AddressEntry[] {
  return (['marketAllowlist', 'marketBlocklist'] as const).flatMap((key) =>
    (config[key] ?? []).flatMap((m, i) =>
      m.assets.flatMap((asset, j) =>
        assetAddresses(asset, `${providerPath}.${key}[${i}].assets[${j}]`),
      ),
    ),
  )
}

/**
 * Validates all developer-supplied addresses in an ActionsConfig.
 * Iterates all lend and swap providers generically, so new providers are covered automatically.
 * Collects all failures before throwing a single Error.
 * @throws Error listing all invalid addresses with their locations and chain IDs.
 */
export function validateConfigAddresses(config: {
  lend?: LendConfig
  swap?: SwapConfig
  assets?: AssetsConfig
}): void {
  const addresses: AddressEntry[] = [
    ...Object.entries(config.lend ?? {}).flatMap(([name, cfg]) =>
      lendProviderAddresses(cfg as LendProviderConfig, `lend.${name}`),
    ),
    ...Object.entries(config.swap ?? {}).flatMap(([name, cfg]) =>
      swapProviderAddresses(cfg as SwapProviderConfig, `swap.${name}`),
    ),
    ...(config.assets?.allow ?? []).flatMap((a, i) =>
      assetAddresses(a, `assets.allow[${i}]`),
    ),
    ...(config.assets?.block ?? []).flatMap((a, i) =>
      assetAddresses(a, `assets.block[${i}]`),
    ),
  ]

  const errors = addresses.flatMap(({ path, value }) => {
    try {
      getAddress(value)
      return []
    } catch {
      return [`  - ${path}: ${value} (not a valid EVM address)`]
    }
  })

  if (errors.length > 0) {
    throw new Error(`Invalid addresses found:\n${errors.join('\n')}`)
  }
}

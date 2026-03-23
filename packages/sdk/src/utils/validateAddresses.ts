import type { Address } from 'viem'
import { getAddress } from 'viem'

import type { SupportedChainId } from '@/constants/supportedChains.js'
import type { AssetsConfig, LendConfig, SwapConfig } from '@/types/actions.js'
import type { Asset } from '@/types/asset.js'
import type { LendMarketConfig } from '@/types/lend/index.js'
import type { SwapMarketConfig } from '@/types/swap/index.js'

type NamedAddresses = Record<string, Address>

/**
 * Validates all values in a Partial<Record<number, T>> address map.
 * T may be a single Address or a record of named addresses.
 * Collects all failures before throwing a single Error listing every invalid entry.
 * @returns The original map if all addresses are valid.
 * @throws Error listing all invalid addresses with their chain IDs and key names.
 */
export function validateAddressMap<M extends Partial<Record<number, Address | NamedAddresses>>>(
  map: M,
): M {
  const errors: string[] = []

  for (const [chainId, value] of Object.entries(map)) {
    if (!value) continue
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
    if (!value || value === 'native') continue
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

function collectAssetAddressErrors(
  asset: Asset,
  location: string,
  errors: string[],
): void {
  for (const [chainId, addr] of Object.entries(asset.address)) {
    if (!addr || addr === 'native') continue
    try {
      getAddress(addr)
    } catch {
      errors.push(
        `  - ${location} on chain ${chainId}: ${addr} (not a valid EVM address)`,
      )
    }
  }
}

function collectMarketErrors(
  markets: LendMarketConfig[] | undefined,
  section: string,
  errors: string[],
): void {
  if (!markets) return
  for (const market of markets) {
    try {
      getAddress(market.address)
    } catch {
      errors.push(
        `  - ${section}.address: ${market.address} (not a valid EVM address)`,
      )
    }
    collectAssetAddressErrors(market.asset, `${section}.asset.address`, errors)
  }
}

function collectSwapMarketErrors(
  markets: SwapMarketConfig[] | undefined,
  section: string,
  errors: string[],
): void {
  if (!markets) return
  for (const market of markets) {
    for (const asset of market.assets) {
      collectAssetAddressErrors(asset, `${section}.assets[].address`, errors)
    }
  }
}

/**
 * Validates all developer-supplied addresses in an ActionsConfig.
 * Validates lend market addresses, swap asset addresses, and asset allow/block list addresses.
 * Collects all failures before throwing a single Error.
 * @throws Error listing all invalid addresses with their locations and chain IDs.
 */
export function validateConfigAddresses(config: {
  lend?: LendConfig
  swap?: SwapConfig
  assets?: AssetsConfig
}): void {
  const errors: string[] = []

  if (config.lend?.morpho) {
    collectMarketErrors(
      config.lend.morpho.marketAllowlist,
      'lend.morpho.marketAllowlist[]',
      errors,
    )
    collectMarketErrors(
      config.lend.morpho.marketBlocklist,
      'lend.morpho.marketBlocklist[]',
      errors,
    )
  }

  if (config.lend?.aave) {
    collectMarketErrors(
      config.lend.aave.marketAllowlist,
      'lend.aave.marketAllowlist[]',
      errors,
    )
    collectMarketErrors(
      config.lend.aave.marketBlocklist,
      'lend.aave.marketBlocklist[]',
      errors,
    )
  }

  if (config.swap?.uniswap) {
    collectSwapMarketErrors(
      config.swap.uniswap.marketAllowlist,
      'swap.uniswap.marketAllowlist[]',
      errors,
    )
    collectSwapMarketErrors(
      config.swap.uniswap.marketBlocklist,
      'swap.uniswap.marketBlocklist[]',
      errors,
    )
  }

  if (config.assets?.allow) {
    for (const asset of config.assets.allow) {
      collectAssetAddressErrors(asset, 'assets.allow[].address', errors)
    }
  }

  if (config.assets?.block) {
    for (const asset of config.assets.block) {
      collectAssetAddressErrors(asset, 'assets.block[].address', errors)
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid addresses found:\n${errors.join('\n')}`)
  }
}

import {
  type EnsName,
  isEnsName,
  type NodeActionsConfig,
} from '@eth-optimism/actions-sdk'
import { type Address, getAddress, isAddress } from 'viem'
import { mainnet } from 'viem/chains'

import { CliError } from '@/output/errors.js'

/**
 * @description Guards that Ethereum mainnet (chain ID 1) is present in the
 * resolved chain config before any ENS read. `EnsNamespace` resolves names on
 * mainnet and silently falls back to a public RPC when mainnet is absent; the
 * CLI insists on an operator-trusted endpoint instead (a malicious RPC can
 * return a fake address), so we surface a clean `config` error up front rather
 * than letting the SDK's fallback run. Set `MAINNET_RPC_URL` to enable ENS.
 * @param config - The resolved Actions config for this process.
 * @throws `CliError` with code `config` when mainnet is not configured.
 */
export function requireMainnet(config: NodeActionsConfig<never>): void {
  if (!config.chains.some((chain) => chain.chainId === mainnet.id)) {
    throw new CliError(
      'config',
      'ENS operations require Ethereum mainnet (chain ID 1). ' +
        'Set MAINNET_RPC_URL to a trusted endpoint to enable ENS reads.',
      { chainId: mainnet.id },
    )
  }
}

/**
 * @description Validates that an input is ENS-name-shaped (at least one dot,
 * via the SDK's `isEnsName`) before forwarding it to `actions.ens.getAddress`.
 * Shape-checking at the resolver layer means a non-name input (e.g. a raw
 * address or a bare label) surfaces as `validation` rather than bubbling
 * through the SDK as a `network` failure. True ENSIP-15 validity is still
 * decided on-chain by the SDK.
 * @param input - Raw positional argument from argv.
 * @returns The input narrowed to `EnsName`.
 * @throws `CliError` with code `validation` when the input is not name-shaped.
 */
export function requireEnsName(input: string): EnsName {
  if (!isEnsName(input)) {
    throw new CliError(
      'validation',
      `Invalid ENS name: "${input}" (expected a dot-separated name, e.g. vitalik.eth)`,
      { input },
    )
  }
  return input
}

/**
 * @description Validates that an input is a 0x-prefixed address before
 * forwarding it to a reverse lookup, returning the checksummed form so
 * case-only typos surface as `validation` rather than a downstream RPC
 * mismatch.
 * @param input - Raw positional argument from argv.
 * @returns The checksummed `Address`.
 * @throws `CliError` with code `validation` when the input is not an address.
 */
export function requireAddress(input: string): Address {
  if (!isAddress(input)) {
    throw new CliError(
      'validation',
      `Invalid address: "${input}" (expected a 0x-prefixed 20-byte address)`,
      { input },
    )
  }
  return getAddress(input)
}

/**
 * @description Validates that an input is either an ENS name or a 0x address:
 * the two forms `actions.ens.getInfo` accepts. Addresses are returned
 * checksummed; names are returned verbatim for the SDK to normalize on-chain.
 * @param input - Raw positional argument from argv.
 * @returns The input as a checksummed `Address` or an `EnsName`.
 * @throws `CliError` with code `validation` when the input is neither.
 */
export function requireEnsNameOrAddress(input: string): Address | EnsName {
  if (isAddress(input)) return getAddress(input)
  if (isEnsName(input)) return input
  throw new CliError(
    'validation',
    `Invalid input: "${input}" (expected an ENS name or a 0x-prefixed address)`,
    { input },
  )
}

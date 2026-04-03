import { mainnet } from 'viem/chains'

/**
 * Thrown when an ENS operation is attempted but Ethereum mainnet is not
 * included in the Actions chain configuration.
 */
export class EnsNotConfiguredError extends Error {
  chainId: number

  constructor() {
    super(
      `ENS operations require Ethereum mainnet. ` +
        `Add chain ID ${mainnet.id} to your chain configuration.`,
    )
    this.name = 'EnsNotConfiguredError'
    this.chainId = mainnet.id
  }
}

/**
 * Thrown when an ENS name cannot be resolved to an address — e.g. the name
 * is unregistered, resolves to the zero address, or fails normalization.
 */
export class EnsResolutionError extends Error {
  input: string

  constructor(message: string, input: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EnsResolutionError'
    this.input = input
  }
}

/**
 * Thrown when an ENS RPC call fails due to a network or provider error.
 */
export class EnsRpcError extends Error {
  input: string

  constructor(message: string, input: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EnsRpcError'
    this.input = input
  }
}

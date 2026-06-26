import type { Address } from 'viem'

/**
 * Resolve request-level swap recipient defaults.
 * @param recipient - Explicit output recipient, when provided
 * @param walletAddress - Wallet fallback for wallet-bound requests
 * @returns Explicit recipient, or wallet fallback when omitted
 */
export function resolveSwapRequestRecipient<
  TRecipient,
  TWalletAddress extends TRecipient | undefined,
>(
  recipient: TRecipient | undefined,
  walletAddress: TWalletAddress,
): TRecipient | TWalletAddress {
  return recipient ?? walletAddress
}

/**
 * Resolve the wallet address that owns input tokens for a quote.
 * @param quote - Swap quote recipient and optional wallet binding
 * @returns Wallet address for wallet validation and allowance checks
 */
export function resolveSwapQuoteWalletAddress(quote: {
  walletAddress?: Address
  recipient: Address
}): Address {
  return quote.walletAddress ?? quote.recipient
}

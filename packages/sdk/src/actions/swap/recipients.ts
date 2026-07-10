import type { Address } from 'viem'

import { QuoteWalletAddressMissingError } from '@/core/error/errors.js'

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
 * Require the wallet address that owns input tokens for a quote.
 * @param quote - Swap quote with wallet binding
 * @returns Wallet address for wallet validation and allowance checks
 * @throws If the quote is not wallet-bound
 */
export function resolveSwapQuoteWalletAddress(quote: {
  walletAddress?: Address
}): Address {
  if (!quote.walletAddress) {
    throw new QuoteWalletAddressMissingError()
  }

  return quote.walletAddress
}

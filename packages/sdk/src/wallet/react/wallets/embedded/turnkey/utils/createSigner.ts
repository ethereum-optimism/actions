import { createAccount } from '@turnkey/viem'
import type { LocalAccount } from 'viem'

import type { TurnkeyHostedWalletToActionsWalletOptions } from '@/wallet/react/providers/hosted/types/index.js'

/**
 * Create a viem LocalAccount instance backed by Turnkey
 * @description Wraps the Turnkey SDK's `createAccount` to produce a signing
 * account compatible with viem. Under the hood, this uses the provided
 * `client`, `organizationId`, and `signWith` to authenticate signing requests
 * with Turnkey. If `ethereumAddress` is supplied, it's used directly;
 * otherwise the SDK fetches it from the Turnkey API.
 * @param params.client - Turnkey client instance
 * @param params.organizationId - Turnkey organization ID that owns the signing key
 * @param params.signWith - Wallet account address, private key address, or private key ID
 * @param params.ethereumAddress - Ethereum address to use for this account, in the case that a private key ID is used to sign.
 * @returns Promise resolving to a viem `LocalAccount` with Turnkey as the signer backend
 */
export async function createSigner(
  params: TurnkeyHostedWalletToActionsWalletOptions,
): Promise<LocalAccount> {
  const { client, organizationId, signWith, ethereumAddress } = params
  return createAccount({
    client,
    organizationId,
    signWith,
    ethereumAddress,
  })
}

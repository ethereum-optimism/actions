import type { Context } from 'hono'
import type { Address } from 'viem'

import { errorResponse, requireAuth } from '@/helpers/errors.js'
import {
  type FrontendWalletProofEnv,
  getFrontendWalletAuth,
} from '@/middleware/frontendWalletProof.js'
import * as faucetService from '@/services/faucet.js'
import * as walletService from '@/services/wallet.js'

async function submitReservedDrip(c: Context, recipient: Address) {
  try {
    const result = await faucetService.dripEthToWallet(recipient)
    if (result.success) {
      return c.json({ result: { userOpHash: result.userOpHash } })
    }
    faucetService.releaseDrip(recipient)
    return errorResponse(c, 'Failed to drip ETH to wallet', 500)
  } catch (error) {
    faucetService.releaseDrip(recipient)
    return errorResponse(c, 'Failed to drip ETH to wallet', 500, error)
  }
}

/**
 * @description Applies faucet eligibility, cooldown, and submission to a verified recipient.
 * @param c - Hono request context.
 * @param recipient - Recipient established by an authentication boundary.
 * @returns The faucet response.
 */
async function dripEthToRecipient(c: Context, recipient: Address) {
  try {
    const eligible = await faucetService.isWalletEligibleForFaucet(recipient)
    if (!eligible) {
      return errorResponse(c, 'Wallet is not eligible for the faucet', 400)
    }
    if (!faucetService.reserveDrip(recipient)) {
      return errorResponse(
        c,
        'Faucet already used for this wallet; try again later',
        429,
      )
    }
    return submitReservedDrip(c, recipient)
  } catch (error) {
    return errorResponse(c, 'Failed to drip ETH to wallet', 500, error)
  }
}

/**
 * @description Drips ETH to the smart wallet resolved from a Privy session.
 * @param c - Hono request context.
 * @returns The faucet response.
 */
export async function dripEthToSessionWallet(c: Context) {
  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  try {
    const wallet = await walletService.getWallet(authResult.auth.idToken)
    if (!wallet) return errorResponse(c, 'Wallet not found', 404)
    return dripEthToRecipient(c, wallet.address)
  } catch (error) {
    return errorResponse(c, 'Failed to drip ETH to wallet', 500, error)
  }
}

/**
 * @description Drips ETH to the smart wallet authenticated by owner proof middleware.
 * @param c - Hono request context.
 * @returns The faucet response.
 */
export async function dripEthToFrontendWallet(
  c: Context<FrontendWalletProofEnv>,
) {
  const auth = getFrontendWalletAuth(c)
  if (!auth) return errorResponse(c, 'Unauthorized', 401)
  return dripEthToRecipient(c, auth.recipient)
}

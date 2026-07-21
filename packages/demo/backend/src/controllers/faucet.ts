import type { Context } from 'hono'
import type { Address } from 'viem'
import { z } from 'zod'

import { errorResponse } from '@/helpers/errors.js'
import { AddressSchema } from '@/helpers/schemas.js'
import { validateRequest } from '@/helpers/validation.js'
import * as faucetService from '@/services/faucet.js'

const DripEthRequestSchema = z.object({
  body: z.strictObject({ walletAddress: AddressSchema }),
})

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
 * @description Applies faucet eligibility, cooldown, and submission to a recipient.
 * @param c - Hono request context.
 * @param recipient - Validated faucet recipient.
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
 * @description Drips ETH to the requested wallet without provider-specific authentication.
 * @param c - Hono request context.
 * @returns The faucet response.
 */
export async function dripEthToWallet(c: Context) {
  const validation = await validateRequest(c, DripEthRequestSchema)
  if (!validation.success) return validation.response
  return dripEthToRecipient(c, validation.data.body.walletAddress)
}

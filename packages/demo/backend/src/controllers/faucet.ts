import type { Context } from 'hono'
import { z } from 'zod'

import { errorResponse } from '@/helpers/errors.js'
import { AddressSchema } from '@/helpers/schemas.js'
import { validateRequest } from '@/helpers/validation.js'
import * as faucetService from '@/services/faucet.js'

const DripEthRequestSchema = z.object({
  body: z.strictObject({ walletAddress: AddressSchema }),
})

/**
 * @description Drips ETH to the requested wallet without provider-specific authentication.
 * @param c - Hono request context.
 * @returns The faucet response.
 */
export async function dripEthToWallet(c: Context) {
  const validation = await validateRequest(c, DripEthRequestSchema)
  if (!validation.success) return validation.response

  const outcome = await faucetService.executeFaucetDrip(
    validation.data.body.walletAddress,
  )
  if (outcome.status === 'success') {
    return c.json({ result: { userOpHash: outcome.userOpHash } })
  }
  if (outcome.status === 'ineligible') {
    return errorResponse(c, 'Wallet is not eligible for the faucet', 400)
  }
  if (outcome.status === 'cooldown') {
    return errorResponse(
      c,
      'Faucet already used for this wallet; try again later',
      429,
    )
  }
  return errorResponse(c, 'Failed to drip ETH to wallet', 500, outcome.error)
}

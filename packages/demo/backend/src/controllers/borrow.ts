import { serializeBigInt } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { z } from 'zod'

import { errorResponse } from '@/helpers/errors.js'
import { ChainIdStringSchema } from '@/helpers/schemas.js'
import { validateRequest } from '@/helpers/validation.js'
import * as borrowService from '@/services/borrow.js'

const GetMarketsRequestSchema = z.object({
  query: z.object({
    chainId: ChainIdStringSchema.optional(),
  }),
})

/**
 * GET - Retrieve borrow markets, optionally filtered by chain.
 */
export async function getMarkets(c: Context) {
  try {
    const validation = await validateRequest(c, GetMarketsRequestSchema)
    if (!validation.success) return validation.response

    const { chainId } = validation.data.query
    const markets = await borrowService.getMarkets(chainId ? { chainId } : {})
    return c.json({ result: serializeBigInt(markets) })
  } catch (error) {
    return errorResponse(c, 'Failed to get borrow markets', 500, error)
  }
}

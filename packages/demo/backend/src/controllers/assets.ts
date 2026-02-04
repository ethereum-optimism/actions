import type { Context } from 'hono'

import { getActions } from '@/config/actions.js'
import { serializeBigInt } from '@/utils/serializers.js'

/**
 * GET - Retrieve configured supported assets
 */
export async function getAssets(c: Context) {
  try {
    const actions = getActions()
    const assets = actions.getSupportedAssets()

    return c.json({ result: serializeBigInt(assets) })
  } catch (error) {
    return c.json(
      {
        error: 'Failed to get supported assets',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500,
    )
  }
}

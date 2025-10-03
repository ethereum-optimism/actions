import type { Context, Next } from 'hono'

import { getActions } from '../config/actions.js'

export async function actionsMiddleware(c: Context, next: Next) {
  try {
    getActions()
    await next()
  } catch {
    return c.json({ error: 'Actions SDK not initialized' }, 500)
  }
}

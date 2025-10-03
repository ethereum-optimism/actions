import type { Context, Next } from 'hono'

import { getVerbs } from '../config/actions.js'

export async function verbsMiddleware(c: Context, next: Next) {
  try {
    getVerbs()
    await next()
  } catch {
    return c.json({ error: 'Verbs SDK not initialized' }, 500)
  }
}

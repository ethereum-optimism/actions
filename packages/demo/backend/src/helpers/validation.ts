import type { Context } from 'hono'
import type { z } from 'zod'

export function validateParams<T>(
  c: Context,
  schema: z.ZodSchema<T>,
): { success: false; response: Response } | { success: true; data: T } {
  const validation = schema.safeParse(c.req.param())

  if (!validation.success) {
    return {
      success: false,
      response: c.json(
        {
          error: 'Invalid request',
          details: validation.error.issues,
        },
        400,
      ),
    }
  }

  return { success: true, data: validation.data }
}

export async function validateBody<T>(
  c: Context,
  schema: z.ZodSchema<T>,
): Promise<
  { success: false; response: Response } | { success: true; data: T }
> {
  const body = await c.req.json()
  const validation = schema.safeParse(body)

  if (!validation.success) {
    return {
      success: false,
      response: c.json(
        {
          error: 'Invalid request',
          details: validation.error.issues,
        },
        400,
      ),
    }
  }

  return { success: true, data: validation.data }
}

import type { Context } from 'hono'
import type { z } from 'zod'

type RequestData = {
  params?: unknown
  query?: unknown
  body?: unknown
}

export async function validateRequest<T>(
  c: Context,
  schema: z.ZodSchema<T>,
): Promise<
  { success: false; response: Response } | { success: true; data: T }
> {
  try {
    const params = c.req.param()
    const query = c.req.query()
    let body = {}

    // This will throw if empty
    try {
      body = await c.req.json()
    } catch {
      // Empty object if no body
    }

    const requestData: RequestData = {}
    // Access shape property safely - works with both zod 3.x and 4.x
    const schemaShape =
      'shape' in schema && typeof schema.shape === 'object'
        ? (schema.shape as Record<string, unknown>)
        : {}

    if ('params' in schemaShape) requestData.params = params
    if ('query' in schemaShape) requestData.query = query
    if ('body' in schemaShape) requestData.body = body

    const validation = schema.safeParse(requestData)

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
  } catch (error) {
    return {
      success: false,
      response: c.json(
        {
          error: 'Failed to validate request',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500,
      ),
    }
  }
}

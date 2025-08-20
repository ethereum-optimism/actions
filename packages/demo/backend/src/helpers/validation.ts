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
    const body = await c.req.json().catch(() => ({}))

    const requestData: RequestData = {}
    const schemaShape = (schema as z.ZodObject<z.ZodRawShape>).shape || {}

    if ('params' in schemaShape) requestData.params = params
    if ('query' in schemaShape) requestData.query = query
    if ('body' in schemaShape) requestData.body = body

    const validation = schema.safeParse(requestData)

    if (validation.success) return { success: true, data: validation.data }

    return {
      success: false,
      response: c.json(
        { error: 'Invalid request', details: validation.error.issues },
        400,
      ),
    }
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

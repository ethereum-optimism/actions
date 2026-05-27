import type { Context } from 'hono'
import type { z } from 'zod'

type RequestData = {
  params?: unknown
  query?: unknown
  body?: unknown
}

/**
 * Compact issue summary surfaced in 400 responses. Drops zod-internal
 * fields (`code`, `expected`, `received`, `unionErrors`, ...) so the
 * public 400 shape is just `{ path, message }` per issue. Keeps the
 * response useful for debugging without exposing zod's AST.
 */
export interface ValidationIssue {
  path: string
  message: string
}

function summarizeIssues(issues: z.ZodIssue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }))
}

/**
 * Validate request inputs (params/query/body) against a zod schema.
 *
 * Error envelope (4xx): `{ error: string, details?: ValidationIssue[] }`.
 * The shared `{ error: string }` shape matches what `mapSdkError` returns
 * for borrow routes; `details` is only present on schema-validation 400s.
 *
 * Body parsing: callers that declare a `body` field in their schema get
 * the parsed JSON when the request advertises `Content-Type: application/json`;
 * a malformed body returns a structured 400 instead of being silently
 * coerced to `{}`. Requests without a JSON content type are treated as
 * body-less and validated against `body: {}` (preserves GET-style flow).
 */
export async function validateRequest<T>(
  c: Context,
  schema: z.ZodSchema<T>,
): Promise<
  { success: false; response: Response } | { success: true; data: T }
> {
  try {
    const params = c.req.param()
    const query = c.req.query()
    let body: unknown = {}

    const contentType = c.req.header('content-type') ?? ''
    const isJson = contentType.toLowerCase().startsWith('application/json')
    if (isJson) {
      try {
        body = await c.req.json()
      } catch {
        return {
          success: false,
          response: c.json({ error: 'Invalid JSON body' }, 400),
        }
      }
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
            details: summarizeIssues(validation.error.issues),
          },
          400,
        ),
      }
    }

    return { success: true, data: validation.data }
  } catch {
    // Defensive fallback: never leak inner error messages on 500.
    return {
      success: false,
      response: c.json({ error: 'Failed to validate request' }, 500),
    }
  }
}

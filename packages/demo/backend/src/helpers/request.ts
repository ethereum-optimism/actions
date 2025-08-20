import type { Context } from 'hono'

/**
 * Create a standard error response
 */
export const errorResponse = (
  c: Context,
  message: string,
  error?: unknown,
  status = 500 as const,
): Response =>
  c.json(
    {
      error: message,
      message: error instanceof Error ? error.message : 'Unknown error',
    },
    status,
  )

/**
 * Create a not found response
 */
export const notFoundResponse = (
  c: Context,
  resource: string,
  identifier?: string,
): Response =>
  c.json(
    {
      error: `${resource} not found`,
      message: identifier
        ? `No ${resource.toLowerCase()} found for ${identifier}`
        : `${resource} not found`,
    },
    404,
  )

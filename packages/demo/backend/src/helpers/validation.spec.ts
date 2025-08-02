import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { validateRequest } from './validation.js'

// Mock Hono context
const createMockContext = (
  params: Record<string, string> = {},
  query: Record<string, string | string[]> = {},
  body: unknown = null,
  hasBody = true,
) => {
  return {
    req: {
      param: vi.fn().mockReturnValue(params),
      query: vi.fn().mockReturnValue(query),
      json: vi.fn().mockImplementation(async () => {
        if (!hasBody) throw new Error('No body')
        return body
      }),
    },
    json: vi.fn().mockImplementation((data, status) => ({ data, status })),
  }
}

describe('validateRequest', () => {
  describe('params validation', () => {
    const ParamsSchema = z.object({
      params: z.object({
        userId: z.string().min(1),
        vaultId: z.string(),
      }),
    })

    it('should validate params successfully', async () => {
      const mockContext = createMockContext(
        { userId: '123', vaultId: 'vault-456' },
        {},
        null,
        false,
      )

      const result = await validateRequest(mockContext as any, ParamsSchema)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.params.userId).toBe('123')
        expect(result.data.params.vaultId).toBe('vault-456')
      }
    })

    it('should fail validation for invalid params', async () => {
      const mockContext = createMockContext(
        { userId: '', vaultId: 'vault-456' },
        {},
        null,
        false,
      )

      const result = await validateRequest(mockContext as any, ParamsSchema)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(mockContext.json).toHaveBeenCalledWith(
          {
            error: 'Invalid request',
            details: expect.any(Array),
          },
          400,
        )
      }
    })
  })

  describe('query validation', () => {
    const QuerySchema = z.object({
      query: z.object({
        limit: z.string().optional(),
        cursor: z.string().optional(),
      }),
    })

    it('should validate query parameters successfully', async () => {
      const mockContext = createMockContext(
        {},
        { limit: '10', cursor: 'abc123' },
        null,
        false,
      )

      const result = await validateRequest(mockContext as any, QuerySchema)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.query.limit).toBe('10')
        expect(result.data.query.cursor).toBe('abc123')
      }
    })

    it('should validate empty query parameters', async () => {
      const mockContext = createMockContext({}, {}, null, false)

      const result = await validateRequest(mockContext as any, QuerySchema)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.query).toEqual({})
      }
    })
  })

  describe('body validation', () => {
    const BodySchema = z.object({
      body: z.object({
        name: z.string(),
        email: z.string().email(),
        age: z.number().positive(),
      }),
    })

    it('should validate request body successfully', async () => {
      const requestBody = { name: 'John', email: 'john@example.com', age: 25 }
      const mockContext = createMockContext({}, {}, requestBody, true)

      const result = await validateRequest(mockContext as any, BodySchema)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.body).toEqual(requestBody)
      }
    })

    it('should fail validation for invalid body', async () => {
      const requestBody = { name: '', email: 'invalid-email', age: -5 }
      const mockContext = createMockContext({}, {}, requestBody, true)

      const result = await validateRequest(mockContext as any, BodySchema)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(mockContext.json).toHaveBeenCalledWith(
          {
            error: 'Invalid request',
            details: expect.any(Array),
          },
          400,
        )
      }
    })

    it('should handle missing body gracefully', async () => {
      const EmptyBodySchema = z.object({
        body: z.object({}).optional(),
      })
      const mockContext = createMockContext({}, {}, null, false)

      const result = await validateRequest(mockContext as any, EmptyBodySchema)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.body).toEqual({})
      }
    })
  })

  describe('combined validation', () => {
    const CombinedSchema = z.object({
      params: z.object({
        userId: z.string().min(1),
      }),
      query: z.object({
        include: z.string().optional(),
      }),
      body: z.object({
        name: z.string(),
        email: z.string(),
      }),
    })

    it('should validate all sections successfully', async () => {
      const mockContext = createMockContext(
        { userId: '123' },
        { include: 'profile' },
        { name: 'John', email: 'john@example.com' },
        true,
      )

      const result = await validateRequest(mockContext as any, CombinedSchema)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.params.userId).toBe('123')
        expect(result.data.query.include).toBe('profile')
        expect(result.data.body.name).toBe('John')
        expect(result.data.body.email).toBe('john@example.com')
      }
    })

    it('should fail if any section is invalid', async () => {
      const mockContext = createMockContext(
        { userId: '' }, // Invalid params
        { include: 'profile' },
        { name: 'John', email: 'john@example.com' },
        true,
      )

      const result = await validateRequest(mockContext as any, CombinedSchema)

      expect(result.success).toBe(false)
    })
  })

  describe('schema detection', () => {
    it('should only include sections defined in schema', async () => {
      const ParamsOnlySchema = z.object({
        params: z.object({
          id: z.string(),
        }),
      })

      const mockContext = createMockContext(
        { id: '123' },
        { limit: '10' }, // This should be ignored
        { name: 'John' }, // This should be ignored
        true,
      )

      const result = await validateRequest(mockContext as any, ParamsOnlySchema)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.params.id).toBe('123')
        expect('query' in result.data).toBe(false)
        expect('body' in result.data).toBe(false)
      }
    })
  })

  describe('error handling', () => {
    it('should handle JSON parsing errors gracefully', async () => {
      const BodySchema = z.object({
        body: z.object({}).optional(),
      })

      const mockContext = createMockContext({}, {}, null, false)
      // Mock json() to throw error
      mockContext.req.json.mockRejectedValue(new Error('Invalid JSON'))

      const result = await validateRequest(mockContext as any, BodySchema)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.body).toEqual({})
      }
    })

    it('should handle unexpected errors', async () => {
      const mockContext = {
        req: {
          param: vi.fn().mockImplementation(() => {
            throw new Error('Unexpected error')
          }),
          query: vi.fn(),
          json: vi.fn(),
        },
        json: vi.fn().mockImplementation((data, status) => ({ data, status })),
      }

      const result = await validateRequest(
        mockContext as any,
        z.object({ params: z.object({}) }),
      )

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(mockContext.json).toHaveBeenCalledWith(
          {
            error: 'Failed to validate request',
            message: 'Unexpected error',
          },
          500,
        )
      }
    })
  })
})

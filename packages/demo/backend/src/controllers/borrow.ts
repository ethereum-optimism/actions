import { serializeBigInt } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { z } from 'zod'

import { errorResponse, requireAuth } from '@/helpers/errors.js'
import {
  AmountExactSchema,
  AmountWithMaxSchema,
  BorrowMarketIdSchema,
  ChainIdStringSchema,
} from '@/helpers/schemas.js'
import { validateRequest } from '@/helpers/validation.js'
import * as borrowService from '@/services/borrow.js'

/**
 * Quote bodies are passed opaquely to the SDK; we only enforce that the
 * action discriminator matches the route. Deep validation of the quote
 * shape is the SDK's responsibility at execute time.
 */
function quoteBodySchema(action: string) {
  return z.strictObject({
    quote: z
      .object({
        action: z.literal(action),
      })
      .passthrough(),
  })
}

const GetMarketsRequestSchema = z.object({
  query: z.object({
    chainId: ChainIdStringSchema.optional(),
  }),
})

/**
 * GET - Retrieve borrow markets, optionally filtered by chain.
 * Errors propagate to the borrow-scoped `app.onError` handler.
 */
export async function getMarkets(c: Context) {
  const validation = await validateRequest(c, GetMarketsRequestSchema)
  if (!validation.success) return validation.response

  const { chainId } = validation.data.query
  const markets = await borrowService.getMarkets(chainId ? { chainId } : {})
  return c.json({ result: serializeBigInt(markets) })
}

/**
 * POST - Get a lightweight borrow price preview. Currently a stub
 * pending SDK support: PR #3's borrow namespace does not expose
 * `getPrice` (only `getMarket`, `getMarkets`, `getPosition`). Returns
 * 501 until a follow-up adds price preview to the SDK or to the
 * provider's public surface.
 */
export async function getPrice(c: Context) {
  return errorResponse(
    c,
    'Borrow price preview not yet supported; SDK exposes only execute.',
    501,
  )
}

/**
 * POST - Build a recipient-bound borrow quote. Currently a stub pending
 * SDK support: PR #3's borrow namespace builds quotes implicitly inside
 * `wallet.borrow.*` (execute-only), with no standalone quote-build
 * endpoint. Returns 501 until a follow-up exposes a quote-only path.
 */
export async function getQuote(c: Context) {
  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error
  return errorResponse(
    c,
    'Borrow quote endpoint not yet supported; use the mutation endpoints which build quotes internally.',
    501,
  )
}

// ---------- Mutations ----------

const OpenParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  borrowAmount: AmountExactSchema,
  collateralAmount: AmountExactSchema.optional(),
})

const OpenRequestSchema = z.object({
  body: z.union([OpenParamsBody, quoteBodySchema('open')]),
})

/**
 * POST - Open a borrow position (Morpho variant). Body is either fresh
 * params or a pre-built quote with action='open'.
 */
export async function openPosition(c: Context) {
  const validation = await validateRequest(c, OpenRequestSchema)
  if (!validation.success) return validation.response

  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const result = await borrowService.openPosition({
    idToken: authResult.auth.idToken,
    ...validation.data.body,
  } as Parameters<typeof borrowService.openPosition>[0])
  return c.json({ result: serializeBigInt(result) })
}

const CloseParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  borrowAmount: AmountWithMaxSchema,
  collateralAmount: AmountWithMaxSchema.optional(),
})

const CloseRequestSchema = z.object({
  body: z.union([CloseParamsBody, quoteBodySchema('close')]),
})

export async function closePosition(c: Context) {
  const validation = await validateRequest(c, CloseRequestSchema)
  if (!validation.success) return validation.response

  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const result = await borrowService.closePosition({
    idToken: authResult.auth.idToken,
    ...validation.data.body,
  } as Parameters<typeof borrowService.closePosition>[0])
  return c.json({ result: serializeBigInt(result) })
}

const DepositCollateralParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  amount: AmountExactSchema,
})

const DepositCollateralRequestSchema = z.object({
  body: z.union([
    DepositCollateralParamsBody,
    quoteBodySchema('depositCollateral'),
  ]),
})

export async function depositCollateral(c: Context) {
  const validation = await validateRequest(c, DepositCollateralRequestSchema)
  if (!validation.success) return validation.response

  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const result = await borrowService.depositCollateral({
    idToken: authResult.auth.idToken,
    ...validation.data.body,
  } as Parameters<typeof borrowService.depositCollateral>[0])
  return c.json({ result: serializeBigInt(result) })
}

const WithdrawCollateralParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  amount: AmountWithMaxSchema,
})

const WithdrawCollateralRequestSchema = z.object({
  body: z.union([
    WithdrawCollateralParamsBody,
    quoteBodySchema('withdrawCollateral'),
  ]),
})

export async function withdrawCollateral(c: Context) {
  const validation = await validateRequest(c, WithdrawCollateralRequestSchema)
  if (!validation.success) return validation.response

  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const result = await borrowService.withdrawCollateral({
    idToken: authResult.auth.idToken,
    ...validation.data.body,
  } as Parameters<typeof borrowService.withdrawCollateral>[0])
  return c.json({ result: serializeBigInt(result) })
}

const RepayParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  amount: AmountWithMaxSchema,
})

const RepayRequestSchema = z.object({
  body: z.union([RepayParamsBody, quoteBodySchema('repay')]),
})

export async function repay(c: Context) {
  const validation = await validateRequest(c, RepayRequestSchema)
  if (!validation.success) return validation.response

  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const result = await borrowService.repay({
    idToken: authResult.auth.idToken,
    ...validation.data.body,
  } as Parameters<typeof borrowService.repay>[0])
  return c.json({ result: serializeBigInt(result) })
}

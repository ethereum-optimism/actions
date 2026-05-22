import { serializeBigInt } from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { z } from 'zod'

import { requireAuth } from '@/helpers/errors.js'
import {
  AmountExactSchema,
  AmountWithMaxSchema,
  BorrowMarketIdSchema,
  ChainIdStringSchema,
} from '@/helpers/schemas.js'
import { validateRequest } from '@/helpers/validation.js'
import * as borrowService from '@/services/borrow.js'
import * as walletService from '@/services/wallet.js'

const GetMarketsRequestSchema = z.object({
  query: z.object({
    chainId: ChainIdStringSchema.optional(),
  }),
})

// Both `/borrow/price` and `/borrow/quote` are auth-gated and derive
// `walletAddress` from the idToken, so neither accepts it in the body.
export const QuoteBodySchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('open'),
    marketId: BorrowMarketIdSchema,
    borrowAmount: AmountExactSchema,
    collateralAmount: AmountExactSchema.optional(),
  }),
  z.strictObject({
    action: z.literal('close'),
    marketId: BorrowMarketIdSchema,
    borrowAmount: AmountWithMaxSchema,
    collateralAmount: AmountWithMaxSchema.optional(),
  }),
  z.strictObject({
    action: z.literal('depositCollateral'),
    marketId: BorrowMarketIdSchema,
    amount: AmountExactSchema,
  }),
  z.strictObject({
    action: z.literal('withdrawCollateral'),
    marketId: BorrowMarketIdSchema,
    amount: AmountWithMaxSchema,
  }),
  z.strictObject({
    action: z.literal('repay'),
    marketId: BorrowMarketIdSchema,
    amount: AmountWithMaxSchema,
  }),
])

const QuoteRequestSchema = z.object({ body: QuoteBodySchema })

export async function getMarkets(c: Context) {
  const validation = await validateRequest(c, GetMarketsRequestSchema)
  if (!validation.success) return validation.response

  const { chainId } = validation.data.query
  const markets = await borrowService.getMarkets(chainId ? { chainId } : {})
  return c.json({ result: serializeBigInt(markets) })
}

// Auth runs before schema so unauthenticated calls always 401.
// `walletAddress` is derived from the idToken; the schema rejects any
// caller-supplied value.
async function buildQuote(c: Context) {
  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const validation = await validateRequest(c, QuoteRequestSchema)
  if (!validation.success) return validation.response

  const wallet = await walletService.getWallet(authResult.auth.idToken)
  if (!wallet) {
    return c.json({ error: 'Wallet not found' }, 404)
  }

  const quote = await borrowService.getQuote({
    ...validation.data.body,
    walletAddress: wallet.address,
  })
  return c.json({ result: serializeBigInt(quote) })
}

export const getPrice = buildQuote
export const getQuote = buildQuote

// ---------- Mutations ----------

const OpenParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  borrowAmount: AmountExactSchema,
  collateralAmount: AmountExactSchema.optional(),
})

const OpenRequestSchema = z.object({ body: OpenParamsBody })

export async function openPosition(c: Context) {
  const validation = await validateRequest(c, OpenRequestSchema)
  if (!validation.success) return validation.response

  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const input = { idToken: authResult.auth.idToken, ...validation.data.body }
  const result = await borrowService.openPosition(input)
  return c.json({ result: serializeBigInt(result) })
}

const CloseParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  borrowAmount: AmountWithMaxSchema,
  collateralAmount: AmountWithMaxSchema.optional(),
})

const CloseRequestSchema = z.object({ body: CloseParamsBody })

export async function closePosition(c: Context) {
  const validation = await validateRequest(c, CloseRequestSchema)
  if (!validation.success) return validation.response

  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const input = { idToken: authResult.auth.idToken, ...validation.data.body }
  const result = await borrowService.closePosition(input)
  return c.json({ result: serializeBigInt(result) })
}

const DepositCollateralParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  amount: AmountExactSchema,
})

const DepositCollateralRequestSchema = z.object({
  body: DepositCollateralParamsBody,
})

export async function depositCollateral(c: Context) {
  const validation = await validateRequest(c, DepositCollateralRequestSchema)
  if (!validation.success) return validation.response

  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const input = { idToken: authResult.auth.idToken, ...validation.data.body }
  const result = await borrowService.depositCollateral(input)
  return c.json({ result: serializeBigInt(result) })
}

const WithdrawCollateralParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  amount: AmountWithMaxSchema,
})

const WithdrawCollateralRequestSchema = z.object({
  body: WithdrawCollateralParamsBody,
})

export async function withdrawCollateral(c: Context) {
  const validation = await validateRequest(c, WithdrawCollateralRequestSchema)
  if (!validation.success) return validation.response

  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const input = { idToken: authResult.auth.idToken, ...validation.data.body }
  const result = await borrowService.withdrawCollateral(input)
  return c.json({ result: serializeBigInt(result) })
}

const RepayParamsBody = z.strictObject({
  marketId: BorrowMarketIdSchema,
  amount: AmountWithMaxSchema,
})

const RepayRequestSchema = z.object({ body: RepayParamsBody })

export async function repay(c: Context) {
  const validation = await validateRequest(c, RepayRequestSchema)
  if (!validation.success) return validation.response

  const authResult = requireAuth(c)
  if ('error' in authResult) return authResult.error

  const input = { idToken: authResult.auth.idToken, ...validation.data.body }
  const result = await borrowService.repay(input)
  return c.json({ result: serializeBigInt(result) })
}

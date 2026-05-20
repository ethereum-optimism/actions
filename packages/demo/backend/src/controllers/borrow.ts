import {
  type BorrowAction,
  type BorrowQuote,
  serializeBigInt,
} from '@eth-optimism/actions-sdk'
import type { Context } from 'hono'
import { z } from 'zod'

import { requireAuth } from '@/helpers/errors.js'
import {
  AddressSchema,
  AmountExactSchema,
  AmountWithMaxSchema,
  BorrowMarketIdSchema,
  ChainIdStringSchema,
} from '@/helpers/schemas.js'
import { validateRequest } from '@/helpers/validation.js'
import * as borrowService from '@/services/borrow.js'
import * as walletService from '@/services/wallet.js'

/**
 * Mutation bodies that carry a pre-built quote. The backend enforces
 * the action discriminator (so a quote can't be replayed against the
 * wrong route) and the `marketId` tagged union (so `decorateReceipt`
 * can read `chainId` without a TypeError when the SDK's quote shape
 * drifts). Other quote fields (`execution`, `recipient`, `expiresAt`,
 * `safeCeilingLtv`, fee detail) are passed opaquely to the SDK, which
 * owns recipient binding and expiry validation.
 *
 * Trust boundary: the auth token authorizes execution against the
 * user's own session wallet. A caller swapping `execution.transactions`
 * for arbitrary calldata is exercising authority they already have over
 * their own wallet; the backend does not claim to enforce "only borrow
 * calldata" beyond what the SDK validates.
 */
export function quoteBodySchema(action: BorrowAction) {
  return z.strictObject({
    quote: z
      .object({
        action: z.literal(action),
        marketId: BorrowMarketIdSchema,
      })
      .passthrough()
      .transform((q) => q as unknown as BorrowQuote),
  })
}

const GetMarketsRequestSchema = z.object({
  query: z.object({
    chainId: ChainIdStringSchema.optional(),
  }),
})

/**
 * Per-action base shape shared by `/borrow/price` and `/borrow/quote`.
 * Discriminated by `action`; each variant carries the per-action amount
 * fields. Backend resolves `marketId` to a full `BorrowMarketConfig`
 * server-side.
 *
 * `/borrow/price` extends each variant with an optional `walletAddress`
 * for previewing a hypothetical position. `/borrow/quote` rejects
 * `walletAddress` at the schema boundary: the recipient is auth-bound
 * and derived from the idToken, so a body-supplied value is meaningless
 * and confuses the trust model.
 */
const OpenActionBase = z.object({
  action: z.literal('open'),
  marketId: BorrowMarketIdSchema,
  borrowAmount: AmountExactSchema,
  collateralAmount: AmountExactSchema.optional(),
})
const CloseActionBase = z.object({
  action: z.literal('close'),
  marketId: BorrowMarketIdSchema,
  borrowAmount: AmountWithMaxSchema,
  collateralAmount: AmountWithMaxSchema.optional(),
})
const DepositCollateralActionBase = z.object({
  action: z.literal('depositCollateral'),
  marketId: BorrowMarketIdSchema,
  amount: AmountExactSchema,
})
const WithdrawCollateralActionBase = z.object({
  action: z.literal('withdrawCollateral'),
  marketId: BorrowMarketIdSchema,
  amount: AmountWithMaxSchema,
})
const RepayActionBase = z.object({
  action: z.literal('repay'),
  marketId: BorrowMarketIdSchema,
  amount: AmountWithMaxSchema,
})

const withOptionalWalletAddress = <T extends z.ZodRawShape>(
  base: z.ZodObject<T>,
) => base.extend({ walletAddress: AddressSchema.optional() }).strict()

export const PriceBodySchema = z.discriminatedUnion('action', [
  withOptionalWalletAddress(OpenActionBase),
  withOptionalWalletAddress(CloseActionBase),
  withOptionalWalletAddress(DepositCollateralActionBase),
  withOptionalWalletAddress(WithdrawCollateralActionBase),
  withOptionalWalletAddress(RepayActionBase),
])

export const QuoteBodySchema = z.discriminatedUnion('action', [
  OpenActionBase.strict(),
  CloseActionBase.strict(),
  DepositCollateralActionBase.strict(),
  WithdrawCollateralActionBase.strict(),
  RepayActionBase.strict(),
])

const PriceRequestSchema = z.object({ body: PriceBodySchema })
const QuoteRequestSchema = z.object({ body: QuoteBodySchema })

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
 * POST - Lightweight borrow price preview: positionAfter + fees +
 * safeCeilingLtv, no calldata bundle. Public route; the body supplies
 * the `walletAddress` whose hypothetical position is being previewed.
 */
export async function getPrice(c: Context) {
  const validation = await validateRequest(c, PriceRequestSchema)
  if (!validation.success) return validation.response

  const price = await borrowService.getPrice(validation.data.body)
  return c.json({ result: serializeBigInt(price) })
}

/**
 * POST - Recipient-bound borrow quote with pre-built calldata. Auth
 * required; `walletAddress` is derived from the authenticated idToken
 * so quote calldata can't be bound to a third party. `QuoteBodySchema`
 * is strict and omits `walletAddress`, so a body-supplied value is
 * rejected at the schema boundary with 400.
 */
export async function getQuote(c: Context) {
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

  const idToken = authResult.auth.idToken
  const body = validation.data.body
  const input =
    'quote' in body ? { idToken, quote: body.quote } : { idToken, ...body }
  const result = await borrowService.openPosition(input)
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

  const idToken = authResult.auth.idToken
  const body = validation.data.body
  const input =
    'quote' in body ? { idToken, quote: body.quote } : { idToken, ...body }
  const result = await borrowService.closePosition(input)
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

  const idToken = authResult.auth.idToken
  const body = validation.data.body
  const input =
    'quote' in body ? { idToken, quote: body.quote } : { idToken, ...body }
  const result = await borrowService.depositCollateral(input)
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

  const idToken = authResult.auth.idToken
  const body = validation.data.body
  const input =
    'quote' in body ? { idToken, quote: body.quote } : { idToken, ...body }
  const result = await borrowService.withdrawCollateral(input)
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

  const idToken = authResult.auth.idToken
  const body = validation.data.body
  const input =
    'quote' in body ? { idToken, quote: body.quote } : { idToken, ...body }
  const result = await borrowService.repay(input)
  return c.json({ result: serializeBigInt(result) })
}

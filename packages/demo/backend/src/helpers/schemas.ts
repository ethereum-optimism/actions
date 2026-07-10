import type { SupportedChainId } from '@eth-optimism/actions-sdk'
import type { Address, Hex } from 'viem'
import { z } from 'zod'

/**
 * Address schema: validates `0x` + 40 hex chars, normalizes to lowercase,
 * and emits a typed `Address`. Not EIP-55 checksum-validated; matches the
 * permissive convention already used by lend / swap controllers.
 */
export const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .transform((s) => s.toLowerCase() as Address)

/**
 * Bytes32 schema: validates `0x` + 64 hex chars, normalizes to lowercase,
 * and emits a typed `Hex`. Used for Morpho Blue market identifiers.
 */
export const Bytes32Schema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid bytes32 format')
  .transform((s) => s.toLowerCase() as Hex)

/**
 * ChainId schema (body / numeric form): validates positive integer and
 * emits a typed `SupportedChainId`.
 */
export const ChainIdSchema = z
  .number()
  .int()
  .positive()
  .transform((n) => n as SupportedChainId)

/**
 * ChainId schema (path-param / string form): Hono path params arrive as
 * strings. Validates a positive integer string and emits a typed
 * `SupportedChainId`.
 */
export const ChainIdStringSchema = z
  .string()
  .regex(/^\d+$/, 'chainId must be a positive integer string')
  .transform((s) => Number(s) as SupportedChainId)

/** Parse comma-separated positive chain IDs and remove duplicates. */
export const ChainIdsStringSchema = z
  .string()
  .regex(
    /^[1-9]\d*(,[1-9]\d*)*$/,
    'chainIds must be comma-separated positive integers',
  )
  .transform(
    (value) => [...new Set(value.split(',').map(Number))] as SupportedChainId[],
  )

// Shared amount branches. `.max(78)` on `amountRaw` caps the BigInt()
// input at the width of `2^256` to prevent DoS via large digit strings.
const AmountByHuman = z.strictObject({ amount: z.number().positive() })
const AmountByRaw = z.strictObject({
  amountRaw: z.string().regex(/^\d+$/).max(78),
})
const AmountByMax = z.strictObject({ max: z.literal(true) })

/**
 * AmountExact: exactly one of `amount` (human number) or `amountRaw`
 * (decimal-string base units). Emits the SDK-shaped value with
 * `amountRaw` already converted to `bigint`.
 */
export const AmountExactSchema = z
  .union([AmountByHuman, AmountByRaw])
  .transform((v) =>
    'amount' in v ? { amount: v.amount } : { amountRaw: BigInt(v.amountRaw) },
  )

/**
 * AmountWithMax: AmountExact plus the `{ max: true }` sentinel for
 * operations targeting an existing balance (close / withdraw / repay).
 */
export const AmountWithMaxSchema = z
  .union([AmountByHuman, AmountByRaw, AmountByMax])
  .transform((v) =>
    'amount' in v
      ? { amount: v.amount }
      : 'amountRaw' in v
        ? { amountRaw: BigInt(v.amountRaw) }
        : { max: true as const },
  )

/** BorrowMarketId tagged union (Morpho Blue + Aave V3); extend when new providers ship. */
export const BorrowMarketIdSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('morpho-blue'),
    marketId: Bytes32Schema,
    chainId: ChainIdSchema,
  }),
  z.strictObject({
    kind: z.literal('aave-v3'),
    marketId: Bytes32Schema,
    chainId: ChainIdSchema,
  }),
])

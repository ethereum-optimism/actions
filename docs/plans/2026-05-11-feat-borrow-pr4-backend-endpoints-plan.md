---
title: Borrow PR #4 - Demo Backend /borrow Endpoints
type: feat
status: active
date: 2026-05-11
origin: docs/brainstorms/2026-05-08-borrow-pr4-backend-endpoints-brainstorm.md
deepened: 2026-05-11
---

# Borrow PR #4: Demo Backend `/borrow` Endpoints

## Enhancement Summary

**Deepened on:** 2026-05-11 via 10 parallel review/research agents (kieran-typescript, code-simplicity, architecture-strategist, security-sentinel, pattern-recognition, performance-oracle, agent-native, best-practices, framework-docs, sharp-edges skill).

**Re-aligned to PR #3 brainstorm v2 on:** 2026-05-11 after PR #3 committed its full brainstorm (`docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md` on `kevin/borrow-pr3`) which refined the SDK type shape beyond the handoff snapshot this plan was originally based on. Material deltas folded back into this plan:

- **`BorrowMarketId` is a tagged union**, not `{ id, chainId }`. Shape: `{ kind: 'morpho-blue'; marketId: Hex; chainId: SupportedChainId }`. PR #4 ships only the Morpho variant; the union is structured for forward-compat (Aave / Comet / Liquity / Euler).
- **`BorrowMarketConfig` extends `BorrowMarketId`** with `name`, `collateralAsset`, `borrowAsset`, `borrowProvider`, `lendProvider`, optional `healthBufferPct` per-market override.
- **`actions.borrow.getPosition` exists on the read-only namespace** (no wallet binding). PR #4's `GET /wallet/borrow/.../position` derives `walletAddress` from the authenticated idToken, then calls `actions.borrow.getPosition({ marketId, walletAddress })` — cleaner than the originally-planned `wallet.borrow.getPosition()` call.
- **`safeCeilingLtv: number`** is a first-class field on `BorrowQuote` and `BorrowPrice` (PR #3 Decision 7, escalated from PR #5). PR #4 surfaces it unchanged.
- **`healthBufferPct?`** appears on `BorrowMarketConfig` (per-market override) and `BorrowSettings` (global default 0.05). PR #4's `MorphoBorrowDemo` literal may set the override; otherwise SDK default applies. Resolution rule (on SDK / consumer side): `market.healthBufferPct ?? settings.healthBufferPct ?? 0.05`.
- **PR #3 Decision 5 resolved**: `computeMorphoMarketId` and `verifyMorphoMarketId` are SDK-internal standalone helpers (in `packages/sdk/src/actions/shared/morpho/marketParams.ts`). PR #4 does NOT expose either via HTTP. Out of scope. Original Open Question 5 in this plan is closed.
- **`GetBorrowMarketsParams`** = `{ collateralAsset?, borrowAsset?, chainId?, markets? }` (borrow-specific, not the shared `FilterAssetChain` lend uses, because borrow markets carry two assets). `GET /borrow/markets` accepts these as optional query filters; collateralAsset / borrowAsset filters require resolving query strings to `Asset` objects via `resolveAsset` (existing helper).

### Key improvements folded in

1. **Shared branded-schema helpers** (`helpers/schemas.ts`): `AddressSchema`, `Bytes32Schema`, `ChainIdSchema` use zod `.transform()` to emit typed `Address` / `Hex` / `SupportedChainId`. Eliminates `as Address` / `as SupportedChainId` casts that lend currently scatters.
2. **`AmountExact` / `AmountWithMax` schemas use `.transform()` at the validation boundary** to emit normalized `{ amount } | { amountRaw: bigint } | { max: true }` shape; `BigInt(amountRaw)` conversion moves out of services into the schema.
3. **Service-layer types derive from SDK via `Parameters<...>[0]`** instead of hand-rolling, so SDK shape drift becomes a typecheck failure.
4. **`mapSdkError` defensive design**: returns `{ status, message } | undefined`; controller falls back to existing `errorResponse(c, 'Failed to X', 500, error)` when undefined. Message strings are **static per error class** (no SDK `.message` passthrough — prevents leakage of internal addresses, RPC URLs, stack fragments).
5. **`amountRaw` length cap `.max(78)`** prevents `BigInt(longString)` DoS (78 = `2^256` decimal width).
6. **Address / bytes32 lowercase normalization** at the zod boundary prevents future case-comparison bugs.
7. **Schema-enforced `collateralAsset` on Morpho fresh open** via `superRefine` rather than punting to SDK 422.
8. **Phase 0 type-stub shim** (`types/borrow-sdk-stubs.ts`) decouples PR #4 progress from PR #3 review cadence; deleted when PR #3 lands.
9. **Retrofit `mapSdkError` to lend / swap in same PR** (per architecture-strategist: `helpers/errors.ts` is a cross-cutting helper, not a domain — one-domain rule still satisfied).
10. **Typed mock-actions factory** in `test-helpers/mockActions.ts` (typed against real `Actions` interface) prevents test-mock drift across lend / swap / borrow.
11. **`getBorrowPosition` always wraps in try/catch** with `errorResponse` (fixes — does NOT propagate — the existing `getLendPosition` inconsistency at `controllers/wallet.ts:74-94`).
12. **Wallet `borrow` not-configured guard** mirrors the existing `wallet.lend` guard at `services/wallet.ts:69-71`; throws `'Borrow functionality not configured'` cleanly.

### Deepening recommendations — resolved

- **R1: ADOPTED.** Auth-gate `/borrow/quote`; recipient derived from authenticated idToken. Overrides brainstorm Key Decision 7 for `/borrow/quote` specifically; `/borrow/markets` and `/borrow/price` stay public.
- **R2: REJECTED.** Keep all 5 mutation routes (`open`, `close`, `depositCollateral`, `withdrawCollateral`, `repay`) per brainstorm.
- **R3: ADOPTED.** Register Hono `app.onError()` global handler scoped to SDK errors for **borrow routes only** (lend / swap keep their per-route try/catch). Eliminates borrow controllers' try/catch boilerplate.
- **R4: ADOPTED.** Add in-process LRU cache to `/borrow/price` only (1-2s TTL keyed by action + marketId + amounts + recipient). `/borrow/quote` stays uncached (recipient-bound calldata).

### New considerations discovered

- `/borrow/quote` is currently a free position-state oracle for any address (unauthenticated). Acceptable on baseSepolia demo; document and consider rate-limiting before any mainnet exposure.
- Hono `@hono/zod-validator` and `@hono/standard-validator` are mature 2026 idiom; the project's custom `validateRequest` helper is legacy but in-scope to keep (lend / swap also use it; one-domain rule).
- Privy server SDK supports `jwtVerificationKey` env config for locally-cached JWKS key — eliminates per-request key fetches. Verify if `authMiddleware` already uses it; if not, file follow-up.
- Hono `compress()` middleware should be confirmed mounted in `app.ts` — borrow quote bundles (5-20KB) benefit from gzip due to long `0x00` calldata runs.

## Overview

Add 9 HTTP routes to `packages/demo/backend/` that thinly proxy the SDK's `BorrowProvider` (shipped in PR #3) so PR #5's frontend can drive borrow flows. Backend-only work, no SDK / contracts / frontend changes. Mirrors the conventions established by `controllers/lend.ts` and `controllers/swap.ts`: zod validate, `requireAuth`, pass through to the SDK, decorate response with block explorer URLs. No business logic, no cross-domain checks.

## Problem Statement / Motivation

Issue [#391](https://github.com/ethereum-optimism/actions/issues/391):

- Backend has no borrow endpoints today; frontend (#392) can't reach the SDK's borrow primitives.
- Request/response schemas need to stay in sync with SDK public types as they evolve.
- Error handling should surface structured failures (market not allowed, chain mismatch, insufficient liquidity) instead of opaque 500s.
- Lend's `closePosition` has no check for dUSDC pledged as borrow collateral. **Resolved by brainstorm:** the guard lives in PR #5 frontend, not here (see brainstorm Decision 5).

## Proposed Solution

Mirror the SDK's locked surface (PR #3 Decisions 1, 2, 3, 4, 6) 1:1 at the HTTP layer. 9 routes; verb-per-route mutations matching the SDK's 5 named wallet methods; `getPrice`/`getQuote` reads exposed as POSTs (params don't fit query strings cleanly).

### Route table (final, R1 adopted)

```
GET   /borrow/markets                                       public
POST  /borrow/price                                         public  (LRU cached, R4)
POST  /borrow/quote                                         auth    (R1: recipient = auth idToken)
GET   /wallet/borrow/:chainId/:marketId/position            auth

POST  /borrow/position/open                                 auth
POST  /borrow/position/close                                auth
POST  /borrow/position/deposit-collateral                   auth
POST  /borrow/position/withdraw-collateral                  auth
POST  /borrow/position/repay                                auth
```

Mutation bodies accept either fresh params or `{ quote: BorrowQuote }` (discriminated union per SDK Decision 6) — see brainstorm: docs/brainstorms/2026-05-08-borrow-pr4-backend-endpoints-brainstorm.md Key Decision 1.

### File layout (deepened)

```
packages/demo/backend/src/
  controllers/
    borrow.ts              # new: all 5 mutation handlers + getMarkets / getPrice / getQuote
    wallet.ts              # modified: add getBorrowPosition method (with try/catch, fixes existing inconsistency)
    lend.ts                # modified: catch block uses mapSdkError (retrofit, per deepening §9)
    swap.ts                # modified: catch block uses mapSdkError (retrofit, per deepening §9)
  services/
    borrow.ts              # new: thin SDK wrappers, 1:1 with controller methods
    borrow.spec.ts         # new: per-method coverage with vi.mock SDK actions + getWallet
    wallet.ts              # modified: add getBorrowPosition service fn + 'Borrow not configured' guard
  config/
    markets.ts             # modified: add BorrowMarketConfig literal + ALL_BORROW_MARKETS
    actions.ts             # modified: wire borrow: { morpho: { marketAllowlist } } into createActions
  controllers/borrow.spec.ts   # new: schema validation + auth + happy path
  controllers/wallet.spec.ts   # if exists, extend with getBorrowPosition coverage
  helpers/
    errors.ts              # modified: add mapSdkError helper (used by borrow + lend + swap retrofit)
    errors.spec.ts         # new (or extend): mapSdkError per-class + defensive cases
    schemas.ts             # NEW: branded zod helpers (AddressSchema, Bytes32Schema, ChainIdSchema, AmountExactSchema, AmountWithMaxSchema)
    schemas.spec.ts        # NEW: unit tests for transform / refine behavior
  types/
    borrow.ts              # new: service-layer param types (derived from SDK via Parameters<>[0])
    borrow-sdk-stubs.ts    # NEW (Phase 0): interface stubs mirroring PR #3 exports; deleted when PR #3 lands
    index.ts               # modified: re-export borrow types
  test-helpers/
    mockActions.ts         # NEW: typed factory for vi.mock('../config/actions.js') fixtures; shared by lend/swap/borrow specs
  router.ts                # modified: register 9 new routes (or 7 if R2 accepted)
  app.ts                   # MAYBE modified: app.onError() if R3 accepted; compress() verified mounted
```

## Technical Considerations

### Architecture impacts

The backend stays a strictly thin SDK proxy. Adding 9 routes does not introduce business logic. The only net-new pattern in the codebase is `mapSdkError` (helpers/errors.ts) which translates SDK error class instances to `{ status, message }`. Used by borrow in this PR; lend/swap retrofit is a follow-up (out of scope for #391's "one domain per PR" rule from AGENTS.md).

### Performance

`/borrow/price` and `/borrow/quote` use POST, so they are not browser-cacheable. PR #5 will hit `/borrow/price` per keystroke; if perf becomes visible, frontend debounces. Server-side caching is a follow-up if needed (see brainstorm Out of Scope).

### Security

- All mutation routes plus the wallet position read use `authMiddleware` (Privy idToken). Read endpoints stay public; `recipient` is body-supplied for `/borrow/quote` (see "Quote recipient handling" below).
- No new secrets or credentials.
- Quote recipient binding is enforced at the SDK execution layer (Decision 6: `Wallet execute rejects mismatched quotes`). Backend does not pre-check; it passes the quote through.

## System-Wide Impact

### Interaction graph

```
HTTP request
  -> Hono CORS (app.ts:40-66, allows actions.money + Netlify previews)
  -> actionsMiddleware (app.ts:69, SDK init guard)
  -> authMiddleware (per-route on mutations + wallet position, Privy verifyAuthToken)
  -> controller (zod validateRequest -> requireAuth -> service call -> serializeBigInt -> c.json)
  -> service (thin: getActions() or getWallet(idToken), call into SDK borrow)
  -> SDK BorrowProvider (PR #3 territory)
  -> wallet (Privy smart wallet, executes the bundle through executeTransactionBatch)
```

Errors from SDK bubble through the service unwrapped; the controller's `catch` calls `mapSdkError(error)` to translate to `{ status, message }` and returns via `errorResponse(c, message, status, error)`.

### Error propagation

```
SDK throws (e.g., MarketNotAllowedError, ChainNotSupportedError, InsufficientLiquidityError)
  -> service rethrows
  -> controller catches
  -> mapSdkError(error): { status: ContentfulStatusCode; message: string }
  -> errorResponse(c, message, status, error)  // existing helper, logs ≥500
  -> c.json({ error: message }, status)
```

SDK error class names are not finalized yet (PR #3 in flight). Plan ships with the minimum mapping table and tightens during `/ce-work`:

| Status | Trigger |
|---|---|
| 400 | zod validation (handled by validateRequest, not mapSdkError) |
| 401 | requireAuth miss (handled by helpers/errors.ts requireAuth) |
| 403 | MarketNotAllowedError, QuoteRecipientMismatchError, market chain not in allowlist |
| 404 | MarketNotFoundError |
| 410 | QuoteExpiredError |
| 422 | InsufficientLiquidityError, InsufficientCollateralError, HealthFactorTooLowError, route-action vs quote-action mismatch |
| 500 | default (generic Error or unknown) |
| 503 | ProviderNotConfiguredError (when SDK isn't wired for the requested protocol) |

Class names are placeholders; final names come from PR #3. The mapping function uses `instanceof` checks against imported SDK classes, with a default 500 case.

### State lifecycle risks

- **Quote expiry**: backend does not read `expiresAt`. SDK execute throws if expired; mapped to 410. (See SpecFlow §2.)
- **Concurrent quotes from same user**: no backend state. Each request is independent. No quote cache, no quote ID, no server-side quote storage. Lock this explicitly so future contributors don't add caching prematurely.
- **Bundle partial failure**: out of scope. Privy smart wallet + ERC-4337 bundles are atomic per Decision 6 forward-looking finding #6. If non-atomic execution surfaces (e.g., Aave 4-tx bundle on EOA), file a follow-up.
- **Markets allowlist mutation at runtime**: not supported. `ALL_BORROW_MARKETS` is a module-level constant; changing it requires a redeploy.

### API surface parity

- Lend uses `:marketAddress` because lend markets are vault contracts (addresses). Borrow uses `:marketId` because Morpho Blue markets are `bytes32` IDs. Future Aave borrow markets are `(asset, chainId)` per PR #3 forward-looking finding #3; PR #4 ships only the Morpho variant, so this asymmetry is acceptable.
- Wire format is **camelCase**, matching SDK + lend + swap. Bigints serialize as **decimal strings** via `serializeBigInt` (existing helper at `packages/sdk/src/utils/serializers.ts:15-21`). No snake_case translation; no other transforms. (See SpecFlow §4.)
- Field-naming convention for response objects matches SDK output verbatim except for bigint coercion and the addition of `blockExplorerUrls` on mutation responses.

### Integration test scenarios

Five cross-layer scenarios that unit-mocked tests can't catch:

1. **Quote round-trip**: POST `/borrow/quote` for `action: 'open'` returns a `BorrowQuote` whose `execution.transactions[]` round-trips correctly to `/borrow/position/open` via `{ quote }` body. Asserts bigint serialization and discriminator handling.
2. **Auth boundary**: GET `/wallet/borrow/:chainId/:marketId/position` without Authorization → 401; with valid token but for a wallet with no position → 200 with zero-position object (`healthFactor: Infinity`, `borrowAmount: "0"`, `collateralAmount: "0"`).
3. **Both-shape-present rejection**: POST `/borrow/position/open` with body containing BOTH `borrowAmount` and `quote` → 400 "Provide either `quote` or fresh params, not both."
4. **Route-action mismatch**: POST `/borrow/position/open` with `{ quote: { action: 'close', ... } }` → 422 "Quote action does not match route action."
5. **SDK error class mapping**: For each row in the error mapping table, an integration test that mocks the SDK to throw that class and asserts the controller returns the mapped status + message. One test per row.

## Acceptance Criteria

### Functional requirements

- [ ] GET `/borrow/markets` returns `BorrowMarket[]` from `actions.borrow.getMarkets()`. Optional `?chainId=` filter mirroring `/swap/markets`. No pagination.
- [ ] POST `/borrow/price` accepts `{ action, marketId, collateralAmount?, borrowAmount?, recipient? }` and returns `BorrowPrice`. Recipient is optional on `/borrow/price` (no calldata bound).
- [ ] POST `/borrow/quote` requires `authMiddleware` (R1 adopted). Body shape mirrors `/borrow/price` but **omits `recipient`** — recipient is derived server-side from the authenticated idToken (rejects body-supplied `recipient` field with 400 if present). Returns `BorrowQuote`. Rationale: prevents the unauthenticated pre-built-quote phishing vector flagged by sharp-edges and security-sentinel.
- [ ] GET `/wallet/borrow/:chainId/:marketId/position` returns `BorrowMarketPosition`. Never-opened position returns 200 with zero-position object, not 404 (per Decision 4: `healthFactor: Infinity` when `borrowAmount === 0n`). (See SpecFlow §1.)
- [ ] POST `/borrow/position/{open,close,deposit-collateral,withdraw-collateral,repay}` each:
  - Validates body as `BorrowParams | { quote: BorrowQuote }` (discriminated by presence of top-level `quote`). Both present → 400. Neither matches → 400 from zod.
  - Rejects `{ quote }` whose `quote.action` doesn't match the route's verb → 422.
  - Requires `authMiddleware` (Privy idToken in `privy-id-token` header).
  - Calls into `wallet.borrow!.{openPosition|closePosition|depositCollateral|withdrawCollateral|repay}(positionParams | quote)`.
  - Decorates response with `blockExplorerUrls` via `getBlockExplorerUrls` helper.

### Validation rules (zod) — deepened

All shared schema primitives live in `helpers/schemas.ts` and `.transform()` to typed values, so controllers can stop casting:

```ts
// helpers/schemas.ts (NEW — shared by lend / swap / borrow)
import { z } from 'zod'
import type { Address, Hex } from 'viem'
import type { SupportedChainId } from '@eth-optimism/actions-sdk'

export const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid address format')
  .transform((s) => s.toLowerCase() as Address)

export const Bytes32Schema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid bytes32 format')
  .transform((s) => s.toLowerCase() as Hex)

export const ChainIdSchema = z
  .number()
  .int()
  .positive()
  .transform((n) => n as SupportedChainId)

export const ChainIdStringSchema = z
  .string()
  .regex(/^\d+$/, 'chainId must be a positive integer string')
  .transform((s) => Number(s) as SupportedChainId)

// AmountExact: transforms to normalized output. Service layer never calls BigInt().
export const AmountExactSchema = z
  .union([
    z.strictObject({ amount: z.number().positive() }),
    z.strictObject({ amountRaw: z.string().regex(/^\d+$/).max(78) }),
  ])
  .transform((v) =>
    'amount' in v ? { amount: v.amount } : { amountRaw: BigInt(v.amountRaw) },
  )

// AmountWithMax: same idea + { max: true } variant.
export const AmountWithMaxSchema = z
  .union([
    z.strictObject({ amount: z.number().positive() }),
    z.strictObject({ amountRaw: z.string().regex(/^\d+$/).max(78) }),
    z.strictObject({ max: z.literal(true) }),
  ])
  .transform((v) =>
    'amount' in v
      ? { amount: v.amount }
      : 'amountRaw' in v
        ? { amountRaw: BigInt(v.amountRaw) }
        : { max: true as const },
  )
```

**Key changes vs original plan (deepening folded in):**

- `z.strictObject(...)` (Zod 4 idiom; valid in 3.x) replaces `z.object(...).strict()`.
- `.max(78)` on `amountRaw` strings caps `BigInt(...)` cost; 78 = `2^256` decimal width. (Security §4.)
- `.transform()` at schema boundary emits the SDK-shaped value; services don't call `BigInt()`. (Kieran-ts §1.)
- Lowercase normalization on Address / Bytes32 prevents future case-comparison bugs. (Security §3.)
- The `ChainIdStringSchema` variant covers the path-param case (Hono path params arrive as strings; see `wallet.ts:74-94`).

**Per-method body shapes** (per PR #3 Decision 3; unchanged from original plan):

- `open`: `borrowAmount: AmountExact` required, `collateralAmount?: AmountExact`, `collateralAsset?: Address` (see refinement below).
- `close`: `borrowAmount: AmountWithMax` required, `collateralAmount?: AmountWithMax`.
- `depositCollateral`: `amount: AmountExact` required.
- `withdrawCollateral`: `amount: AmountWithMax` required.
- `repay`: `amount: AmountWithMax` required.

**`BorrowMarketId` tagged-union schema** (re-aligned to PR #3 brainstorm v2):

```ts
// helpers/schemas.ts continued — PR #3 v2 shape
export const BorrowMarketIdSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('morpho-blue'),
    marketId: Bytes32Schema,
    chainId: ChainIdSchema,
  }),
  // Aave / Comet / Liquity / Euler variants added when those providers land.
])
```

Path params for `GET /wallet/borrow/:chainId/:marketId/position` arrive as strings; controller assembles the tagged union before passing to `actions.borrow.getPosition`:

```ts
const path = c.req.param() // { chainId: '84532', marketId: '0xabc...' }
const marketId: BorrowMarketId = {
  kind: 'morpho-blue',
  marketId: path.marketId.toLowerCase() as Hex,
  chainId: Number(path.chainId) as SupportedChainId,
}
```

**Schema-enforce `collateralAsset` on Morpho fresh open** (sharp-edges §5):

```ts
const OpenParamsSchema = z
  .strictObject({
    marketId: BorrowMarketIdSchema,
    borrowAmount: AmountExactSchema,
    collateralAmount: AmountExactSchema.optional(),
    collateralAsset: AddressSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // For Morpho-only PR #4: collateralAsset is required when opening a fresh position.
    // Aave (#427) makes this conditional on protocol; revisit when Aave borrow lands.
    if (!data.collateralAsset) {
      ctx.addIssue({
        code: 'custom',
        message: 'collateralAsset is required for Morpho fresh open',
        path: ['collateralAsset'],
      })
    }
  })
```

**Params-vs-quote body discrimination** (kieran-ts §2, best-practices §1, sharp-edges §1):

Use top-level `.superRefine` with explicit both/neither error messages — `z.union` alone produces noisy "no branch matched" output:

```ts
const OpenBodySchema = z
  .strictObject({
    quote: BorrowQuoteSchema.optional(),
    // params variant fields (all optional at schema level; refine enforces exactly-one)
    marketId: BorrowMarketIdSchema.optional(),
    borrowAmount: AmountExactSchema.optional(),
    collateralAmount: AmountExactSchema.optional(),
    collateralAsset: AddressSchema.optional(),
  })
  .superRefine((v, ctx) => {
    const hasQuote = v.quote !== undefined
    const hasParams =
      v.borrowAmount !== undefined ||
      v.collateralAmount !== undefined ||
      v.marketId !== undefined
    if (hasQuote && hasParams) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide either `quote` or fresh params, not both.',
      })
    }
    if (!hasQuote && !hasParams) {
      ctx.addIssue({
        code: 'custom',
        message: 'Body must include `quote` or fresh params.',
      })
    }
    // Route-action vs quote-action mismatch:
    if (hasQuote && v.quote!.action !== 'open') {
      ctx.addIssue({
        code: 'custom',
        message: 'Quote action does not match route action.',
      })
    }
  })
```

Controller narrows with `if ('quote' in data && data.quote) { ... } else { ... }`.

**Service-layer types derived from SDK** (kieran-ts §5):

```ts
// types/borrow.ts
import type { Actions, BorrowQuote } from '@eth-optimism/actions-sdk'
import type { Awaited } from 'type-fest'

type Wallet = Awaited<ReturnType<typeof getWallet>>
type BorrowNS = NonNullable<Wallet['borrow']>

export type BorrowOpenServiceParams =
  | ({ idToken: string } & Parameters<BorrowNS['openPosition']>[0])
  | { idToken: string; quote: BorrowQuote }
// Repeat for close, depositCollateral, withdrawCollateral, repay.
```

Drift between SDK and backend becomes a typecheck error at PR #4's build time the moment PR #3 changes a method signature.

### Non-functional requirements

- [ ] All routes pass `pnpm test`, `pnpm build`, `pnpm typecheck`, `pnpm lint:fix` cleanly.
- [ ] No `.changeset/*.md` file added (per repo-research §10: backend is private, AGENTS.md only mandates changesets for `packages/sdk/`).
- [ ] No edits to `packages/sdk/` or `packages/demo/contracts/` or `packages/demo/frontend/` (one-domain-per-PR rule).

### Test coverage

For each mutation route (`open`, `close`, `depositCollateral`, `withdrawCollateral`, `repay`):
- [ ] Happy path with fresh params → 200, SDK called with mapped args.
- [ ] Happy path with `{ quote }` body → 200, SDK called with the quote.
- [ ] Both params and quote present → 400.
- [ ] Wrong route-action for quote → 422.
- [ ] Missing Authorization → 401, no SDK call.
- [ ] Malformed body (e.g., invalid amount shape) → 400 with zod details.
- [ ] SDK throws each known error class → mapped status (one assertion per class in mapping table).

For reads:
- [ ] `/borrow/markets` returns SDK output verbatim (1:1 passthrough, no filtering or transform).
- [ ] `/borrow/markets?chainId=84532` filters by chain.
- [ ] `/borrow/price` accepts all 5 action discriminator values; invalid action → 400.
- [ ] `/borrow/price` without recipient → 200 (recipient optional).
- [ ] `/borrow/quote` without recipient → 400 (required for quote).
- [ ] `/borrow/quote` with recipient in body when Authorization is also present → 200 (body recipient is authoritative, not the auth wallet). (See SpecFlow §1.)
- [ ] GET `/wallet/borrow/:chainId/:marketId/position` happy path: zero-position (200), active position (200), missing auth (401), malformed marketId in path (400 from zod), unsupported chainId (400).

For helpers/errors.ts:
- [ ] `mapSdkError(<each SDK error class>)` returns the correct `{ status, message }`.
- [ ] `mapSdkError(new Error('something'))` returns `{ status: 500, message: ... }`.
- [ ] `mapSdkError('not an Error')` returns `{ status: 500, message: 'Internal server error' }` (or similar safe default).

For wire format:
- [ ] Bigint roundtrip: a `BorrowMarketPosition` with `borrowAmount: 0n, collateralAmount: 12345n` is serialized as `{ borrowAmount: "0", collateralAmount: "12345" }` on the wire.

Mocking pattern (per repo-research §1):
```ts
vi.mock('../config/actions.js', () => ({ getActions: vi.fn() }))
vi.mock('./wallet.js', () => ({ getWallet: vi.fn() }))

const mockBorrowProvider = {
  getMarkets: vi.fn(),
  getMarket: vi.fn(),
  getPrice: vi.fn(),
  getQuote: vi.fn(),
}
const mockActions = { borrow: mockBorrowProvider }
beforeEach(async () => {
  vi.clearAllMocks()
  const { getActions } = await import('../config/actions.js')
  vi.mocked(getActions).mockReturnValue(mockActions as any)
})
```

## Implementation Phases

Each phase is one commit, sized to keep the tree green at every step. Commit messages 3-7 words, no AI / Claude mentions.

### Phase 0 — Type-stub shim + shared helpers (decouples from PR #3)

Added in deepening to remove the hard PR #3 blocker on Phase 1. Lets PR #4 progress in parallel with PR #3 review cycles.

- **Commit A**: Create `types/borrow-sdk-stubs.ts` with `interface`-only stubs of the PR #3 export surface: `BorrowProvider`, `BorrowMarketConfig`, `BorrowMarketId`, `BorrowMarket`, `BorrowMarketPosition`, `BorrowQuote`, `BorrowPrice`, `BorrowFees`, `BorrowReceipt`, `BorrowAction`, `AmountExact`, `AmountWithMax`, plus placeholder error classes (`MarketNotAllowedError`, `ChainNotSupportedError`, `InsufficientLiquidityError`, `MarketNotFoundError`, `QuoteExpiredError`, `HealthFactorTooLowError`, `ProviderNotConfiguredError`). All names match the brainstorm's expected surface. File is deleted in a single rebase commit when PR #3 lands real exports — controllers `import` from `@eth-optimism/actions-sdk` going forward.
- **Commit B**: Add `helpers/schemas.ts` (shared branded zod schemas — see "Validation rules (zod) — deepened" section). Add `helpers/schemas.spec.ts` with unit tests for transform / refine / `.max(78)` / lowercase normalization behavior. **Used by lend / swap / borrow** — note this is technically a small lend / swap touch (replacing local regex schemas), but stays within the cross-cutting-helper exemption (architecture §1).
- **Commit C**: Add `test-helpers/mockActions.ts` with a typed factory `createMockActions({ lend?, borrow?, swap? }): Actions` whose return type is the real `Actions` interface (not `as any`). Update `lend.spec.ts` and `swap.spec.ts` to use it (their existing `mockReturnValue(mockActions as any)` pattern). Adds zero behavioral change but creates a typed seam for borrow specs.

### Phase 1 — Config + types scaffolding

**Deepening update**: Phase 0 stubs unblock this phase. PR #3 still needs to land for the real wire-up, but Phase 1 commits can proceed against `types/borrow-sdk-stubs.ts`.

- **Commit 1**: Add `MorphoBorrowDemo: BorrowMarketConfig` literal + `ALL_BORROW_MARKETS` in `config/markets.ts` (naming parallels existing `GauntletUSDCDemo` — see pattern-recognition §3). **Re-aligned to PR #3 brainstorm v2**: the literal shape is the tagged union extended with config fields:
  ```ts
  export const MorphoBorrowDemo: BorrowMarketConfig = {
    kind: 'morpho-blue',
    marketId: '<0xbytes32 from deployments.json>',
    chainId: baseSepolia.id,
    name: 'Demo dUSDC / OP',
    collateralAsset: dUSDC_DEMO,           // existing Asset reference; verify export
    borrowAsset: OP_DEMO,                  // existing Asset reference; verify export
    borrowProvider: 'morpho',
    lendProvider: 'morpho',                // dUSDC came from MorphoLendProvider
    // healthBufferPct?: undefined         // defaults to BorrowSettings.healthBufferPct (0.05)
  }
  ```
  Read `deployments.json`'s `morpho.borrow.{marketId, oracle}` for chain 84532. If deploy hasn't run, add a runtime assert `assertDeploymentReady()` that throws at module init when `ALL_BORROW_MARKETS` is empty (gated by `NODE_ENV !== 'production'`) — keeps invalid states unrepresentable rather than tolerating nulls (kieran-ts §7).
- **Commit 2**: Wire `borrow: { morpho: { marketAllowlist: ALL_BORROW_MARKETS } }` in `config/actions.ts` (use `ALL_BORROW_MARKETS` directly; do NOT mirror lend's bug of using `[GauntletUSDCDemo]` inline — see architecture-strategist §3). Add `types/borrow.ts` with `Parameters<>[0]`-derived service param types (see "Service-layer types derived from SDK" above). Re-export from `types/index.ts`.

### Phase 2 — Read endpoints (simplest, no auth)

- **Commit 3**: `services/borrow.ts` with `getMarkets({ chainId? })` passthrough. `controllers/borrow.ts` with `getMarkets` handler (zod schema for optional `?chainId=`). Register `GET /borrow/markets`. Add `borrow.spec.ts` covering happy path + optional chain filter.
- **Commit 4a (`/borrow/price`)**: Service `getPrice(params)` with **LRU cache (R4 adopted)** — wrap the SDK call in a 1-2s TTL LRU keyed by `JSON.stringify({ action, marketId, collateralAmount, borrowAmount, recipient ?? null })`. Use `lru-cache` (verify it's already a backend dep; otherwise add). Controller with zod `BorrowPriceRequestSchema` (discriminated on `action`). Register `POST /borrow/price`. Tests: valid action, invalid action, cache hit returns cached value within TTL, cache miss after TTL.

- **Commit 4b (`/borrow/quote`)**: Service `getQuote(params)` passthrough — **no cache** (recipient-bound calldata + `expiresAt` make staleness a footgun). Controller with `BorrowQuoteRequestSchema`. **Per R1 adopted**: controller is `authMiddleware`-gated; recipient derived from `authResult.auth` (the idToken's wallet address — exact accessor lookup during `/ce-work`). Reject body-supplied `recipient` field with 400. Register `POST /borrow/quote`. Tests: valid auth + valid action, missing auth → 401, body recipient present → 400, invalid action → 400.

### Phase 3 — Wallet position read

- **Commit 5**: Extend `services/wallet.ts` with `getBorrowPosition({ marketId, walletAddress })` that calls `actions.borrow.getPosition({ marketId, walletAddress })` — **re-aligned to PR #3 brainstorm v2**: position lives on the read-only namespace, so the service no longer needs `wallet.borrow!.getPosition()`. The `wallet.borrow` non-null assertion is irrelevant here (read-only path); the not-configured guard is still relevant in mutation services (Phase 4+) and added there. Extend `controllers/wallet.ts` with `getBorrowPosition` method:
  - zod schema uses `Bytes32Schema` + `ChainIdStringSchema` from Phase 0 commit B for path params
  - **always wraps body in try/catch with `errorResponse(c, 'Failed to get borrow position', 500, error)`** (fixes but does not propagate the existing inconsistency in sibling `getLendPosition` per pattern-recognition §1)
  - Derives `walletAddress` from `requireAuth(c)` idToken (exact accessor: `authResult.auth` shape; if the existing `AuthContext` doesn't expose the wallet address, resolve via existing wallet service helper — confirm during implementation)
  - Constructs the tagged-union `BorrowMarketId = { kind: 'morpho-blue', marketId: <bytes32>, chainId: <number> }` from path params
  - Calls `walletService.getBorrowPosition({ marketId, walletAddress })`
  Register `GET /wallet/borrow/:chainId/:marketId/position`. Tests: zero-position 200 (`healthFactor: Infinity`, `borrowAmount: "0"`, `collateralAmount: "0"`), active 200, auth miss 401, invalid path 400, unsupported chain 400.

### Phase 4 — Core mutations (open + close)

- **Commit 6**: `services/borrow.ts` + `controllers/borrow.ts` `openPosition` (params-or-quote body, zod union with strict, both-present 400, route-action check 422). Register `POST /borrow/position/open`. Tests: happy params, happy quote, both-present, wrong-action, auth miss, malformed body.
- **Commit 7**: `closePosition` (same shape, AmountWithMax variant). Register `POST /borrow/position/close`. Tests parallel to commit 6.

### Phase 5 — Partial mutations (deposit / withdraw / repay)

- **Commit 8**: `depositCollateral`. Register route. Tests.
- **Commit 9**: `withdrawCollateral`. Register route. Tests.
- **Commit 10**: `repay`. Register route. Tests.

PR #5 explicitly needs `repay` (per its handoff: "Activity log needs borrow/repay action types"). `depositCollateral` and `withdrawCollateral` are not explicitly listed in PR #5's v1 scope. SpecFlow §5 recommended deferring all three; we keep them in this PR via phased commits so PR #5 isn't blocked if scope expands. If timeline pressure hits, commits 8/9 can be cut without breaking the rest.

### Phase 6 — Error mapping

- **Commit 11**: Add `mapSdkError(error: unknown): { status: ContentfulStatusCode; message: string } | undefined` to `helpers/errors.ts`. Returns `undefined` for unrecognized errors → caller falls back to `errorResponse(c, 'Failed to X', 500, error)`. For known SDK error classes, return **static literal messages**, NOT `error.message` passthrough (prevents leakage of internal addresses, RPC URLs, stack fragments; security §7). Wrap the `instanceof` chain in a defensive try/catch — if mapping itself throws, return `undefined` and fall back (architecture §2). Tests: one per error class in mapping table, plus generic-`Error`, non-`Error` value, and "mapper throws on a renamed/missing class" defensive case.

- **Commit 12 (R3 adopted — borrow-only `app.onError`)**: Register `app.onError(...)` in `app.ts` that catches SDK errors thrown from borrow routes:
  ```ts
  app.onError((err, c) => {
    // Only handle errors from borrow routes; let other routes fall through to their try/catch.
    const path = c.req.path
    if (!path.startsWith('/borrow') && !path.startsWith('/wallet/borrow')) {
      return c.json({ error: 'Internal server error' }, 500)
    }
    const mapped = mapSdkError(err)
    return mapped
      ? errorResponse(c, mapped.message, mapped.status, err)
      : errorResponse(c, 'Internal server error', 500, err)
  })
  ```
  Borrow controllers stop wrapping in try/catch — services throw SDK errors naturally and the global handler maps them. Tests register a borrow route, mock the SDK to throw, assert mapped status. Verify lend / swap still produce their per-verb generic 500 messages (path prefix check excludes them).

- **Commit 13 (deepening: lend / swap retrofit, R3-compatible)**: Retrofit lend / swap controllers' existing `catch` blocks to consult `mapSdkError` (per architecture-strategist §1, helpers are cross-cutting). Each `catch` becomes:
  ```ts
  } catch (error) {
    const mapped = mapSdkError(error)
    return mapped
      ? errorResponse(c, mapped.message, mapped.status, error)
      : errorResponse(c, 'Failed to <verb>', 500, error)
  }
  ```
  Lend / swap keep their try/catch wrappers (no `app.onError` migration) — preserves their per-verb generic messages. Tests stay green because unmapped errors still produce the original 500.

## Dependencies & Risks

### Hard dependencies

1. **PR #3 SDK exports** (BLOCKING for Phase 1). Required exports (re-aligned to PR #3 brainstorm v2): `BorrowProvider` (abstract base), `MorphoBorrowProvider`, `BorrowConfig`, `BorrowProviders`, `BorrowSettings` (carries `healthBufferPct`), `BorrowProviderConfig`, `BorrowProviderName`, `BorrowMarketConfig` (tagged-union extension), `BorrowMarketId` (tagged union — Morpho variant only in PR #3), `BorrowMarket`, `BorrowMarketPosition`, `BorrowQuote` (includes `safeCeilingLtv`), `BorrowPrice` (includes `safeCeilingLtv`), `BorrowFees`, `BorrowReceipt`, `BorrowAction`, `AmountExact`, `AmountWithMax`, `GetBorrowMarketsParams`, plus the SDK error classes. **NOT required by PR #4**: `computeMorphoMarketId`, `verifyMorphoMarketId` (SDK-internal per PR #3 Decision 5). The local sibling worktree at `/Users/kevin/github/optimism/actions-borrow-pr3` (per handoff-pr4.md "Local sibling worktrees" note) can be inspected for in-flight progress without waiting for origin push.
2. **PR #2 deploy run** for chain 84532. `packages/demo/contracts/state/deployments.json` currently has `morpho.borrow.{mockFeed: null, oracle: null, marketId: null}`. The `BorrowMarketConfig` literal in `config/markets.ts` needs a real `marketId`. Either (a) run the deploy before Phase 1 commit 1, or (b) ship Phase 1 with a placeholder that throws clearly until deploy lands.

### Soft dependencies / risks

1. **SDK error class names not final.** PR #3 hasn't shipped error classes yet. Phase 6 mapping table uses placeholder names; tighten during implementation when PR #3 exports them. Acceptable risk: if a class is renamed, that's one `instanceof` line in `mapSdkError`.
2. **PR #3 Decision 5 (calldata validation surface).** Still open in PR #3. Brainstorm noted it does not block PR #4. If PR #3 lands a `validateQuote` helper or similar before PR #4 finishes, decide during `/ce-work` whether the backend surfaces it directly or stays opaque.
3. **Rebase churn.** Pull `origin/kevin/borrow-pr3` before each work session. If PR #3 force-pushes (review feedback rewrites), Phase 1 commits may need amending. Use `git fetch origin && git rebase origin/kevin/borrow-pr3` per the handoff.
4. **AmountExact wire format.** Bigints over the wire are decimal strings per existing `serializeBigInt`. Zod schema validates them as strings; service layer converts to `bigint`. If SDK exposes a different wire convention (e.g., hex strings), reconcile during Phase 4.
5. **PR #5 scope shift.** If PR #5 brainstorms reveal `depositCollateral`/`withdrawCollateral` are not needed in v1 UI, Phase 5 commits 8/9 can be deferred without harm. Check `/Users/kevin/github/optimism/actions-borrow-pr5` for current scope before starting Phase 5.

### Out of scope (file follow-ups if discovered)

- Aave borrow routes (PR #427 territory).
- Backend-side enforcement of `quote.expiresAt` (SDK owns it; integration test verifies SDK throws on expired → mapped to 410).
- Backend-side enforcement of `quote.recipient` against authenticated wallet on auth'd routes (SDK rejects in execute layer; backend short-circuit considered but rejected to keep thin-proxy invariant).
- ~~Retrofit of `mapSdkError` onto lend/swap controllers~~ — **deepening moved this in-scope** (Phase 6 commit 12).
- Backend-side allowlist pre-check before SDK call (rely on SDK + map MarketNotAllowedError to 403).
- WebSocket / SSE position update streams.
- HF projection / liquidation alert business logic (frontend's job per PR #5).
- **Hono `@hono/zod-validator` migration** (validator-agnostic `@hono/standard-validator` is 2026 idiom). Custom `validateRequest` stays to match lend / swap; file follow-up to migrate all three together (framework-docs §1).
- **Wire-type vs domain-type separation** for bigint fields (sharp-edges §6). The runtime/typescript mismatch (`bigint` claimed, `string` delivered) is a real footgun but a cross-cutting refactor better suited to a dedicated PR. Document in `serializeBigInt`'s jsdoc; file follow-up.
- **Privy `jwtVerificationKey` env config** for cached JWKS (framework-docs §4). Verify `authMiddleware` already uses it; if not, file follow-up — out of PR #4 domain.
- **Hono `compress()` middleware** verification — confirm mounted in `app.ts`; if not, file follow-up.

## Deepening Decisions (Resolved 2026-05-11)

The four deepening recommendations were resolved during plan finalization:

| Rec | Decision | Plan location of implementation |
|---|---|---|
| **R1** Auth-gate `/borrow/quote`, recipient from idToken | **ADOPTED** | Route table; Acceptance Criteria → POST /borrow/quote; Phase 2 Commit 4b |
| **R2** Defer `depositCollateral` + `withdrawCollateral` | **REJECTED** | Phase 5 commits 8 / 9 / 10 all ship in PR #4 per brainstorm |
| **R3** Hono `app.onError()` (borrow-only) | **ADOPTED** | Phase 6 Commit 12 |
| **R4** LRU cache on `/borrow/price` | **ADOPTED** | Phase 2 Commit 4a; route table notes "LRU cached" |

Originating findings (for traceability):
- R1 — sharp-edges concern #2 + security-sentinel finding #1 (phishing-vector via unauthenticated pre-built quote bound to victim address).
- R2 — SpecFlow §5 + code-simplicity §1 (PR #5 handoff lists open/close/repay only; deposit/withdraw not explicitly in v1).
- R3 — best-practices research §2 (Hono 2026 idiom; deletes ~5 try/catch blocks in borrow).
- R4 — performance-oracle §1 (Alchemy free tier ~25-50 RPS; keystroke-driven slider in PR #5).

## Sources & References

### Origin

- **Brainstorm document**: `docs/brainstorms/2026-05-08-borrow-pr4-backend-endpoints-brainstorm.md`. Key decisions carried forward:
  - Verb-per-route + `params | { quote }` mutation bodies (brainstorm Key Decision 1).
  - POST for `/borrow/price` and `/borrow/quote` (brainstorm Key Decision 2).
  - HTTP status + freeform message for errors, no code field (brainstorm Key Decision 3).
  - Token addresses omitted from bodies; assets derived from market (brainstorm Key Decision 4).
  - Collateral-locked guard punted to PR #5 frontend (brainstorm Key Decision 5).
  - Wallet position path uses `:marketId` not `:marketAddress` (brainstorm Key Decision 6).
  - Auth mirrors current router conventions: public reads, auth mutations (brainstorm Key Decision 7).

### Internal references

- Reference controllers: `packages/demo/backend/src/controllers/lend.ts:1-119`, `controllers/swap.ts:1-161`, `controllers/wallet.ts:74-94`.
- Reference services: `services/lend.ts:1-83`, `services/swap.ts:1-161`, `services/wallet.ts:88-97`.
- Test mock pattern: `services/lend.spec.ts:1-30`.
- Helpers to extend: `helpers/errors.ts:1-36`, `helpers/validation.ts:1-67`.
- Config to wire: `config/actions.ts:32-39`, `config/markets.ts:1-37`.
- Router for mount order: `router.ts:1-74`.
- Bigint serializer: `packages/sdk/src/utils/serializers.ts:15-21`.
- PR #3 design decisions (cross-branch, sibling worktree): `/Users/kevin/github/optimism/actions-borrow-pr3/handoff.md` (Decisions 1, 2, 3, 4, 6 locked; Decision 5 open).
- PR #5 expected consumer requirements (cross-branch): `/Users/kevin/github/optimism/actions-borrow-pr5/handoff-pr5.md`.

### Engineering conventions

- `AGENTS.md:127`, `:141`: one-domain-per-PR rule; changesets for `packages/sdk/` only.
- `CONTRIBUTING.md:169`: testing requirements.
- Project handoff: `handoff-pr4.md` (commit discipline, 3-7 word messages, full lifecycle).
- Auto-memory feedback: phase-specific commit cadence (plan phase commits once at finalization; work phase commits small).

### Related work

- Issue #391 (this PR).
- Issue #366 (parent epic, "Borrow support").
- Issue #390 (PR #3, SDK BorrowProvider).
- Issue #392 (PR #5, frontend Borrow tab).
- Issue #427 (PR #6, future Aave + e2e polish).
- Cross-cutting follow-ups: #379 (`amount` XOR `amountRaw` convention), #380, #382.

### Deepening research references (2026-05-11)

Industry / framework references surfaced by the deepening pass:

- Hono validation (`@hono/zod-validator`, `@hono/standard-validator`): https://hono.dev/docs/guides/validation
- Hono best practices + `app.onError()` pattern: https://hono.dev/docs/guides/best-practices
- Hono `HTTPException`: https://hono.dev/docs/api/exception
- Hono RPC + typed status codes: https://hono.dev/docs/guides/rpc
- Zod 3 discriminated union vs union: https://v3.zod.dev
- Zod 4 (for awareness, not adopted in this PR): https://zod.dev/v4
- viem `parseUnits` / `isAddress` / `getAddress`: https://viem.sh/docs/utilities/parseUnits, https://viem.sh/docs/utilities/isAddress, https://viem.sh/docs/utilities/getAddress
- Privy access + identity tokens: https://docs.privy.io/authentication/user-authentication/access-tokens, https://docs.privy.io/user-management/users/identity-tokens
- Privy JWKS caching via `jwtVerificationKey`: https://docs.privy.io/recipes/dashboard/optimizing
- Web3 API precedents for POST-style reads: Uniswap trade-api, 0x Swap API, Alchemy `alchemy_simulateAssetChanges`.
- Stripe PaymentIntent confirm shape (analogue for the "split routes per body shape" alternative rejected in sharp-edges #1): https://docs.stripe.com/api/payment_intents/confirm
- Wagmi BigInt serialization FAQ: https://wagmi.sh/react/guides/faq, https://wagmi.sh/core/api/utilities/serialize

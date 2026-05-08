# Borrow PR #4: Demo Backend `/borrow` Endpoints

**Date:** 2026-05-08
**Branch:** `kevin/borrow-pr4`
**Issue:** [ethereum-optimism/actions#391](https://github.com/ethereum-optimism/actions/issues/391)
**Stacked on:** `kevin/borrow-pr3` (SDK BorrowProvider, in-flight)
**Predecessor:** PR #2 (on-chain borrow market) merged-ready; PR #3 (SDK) brainstorming, Decisions 1, 2, 3, 4, 6 locked, Decision 5 open.

## What We're Building

Expose the SDK's borrow surface (5 wallet verbs + 2 read methods + position read) through the demo backend so PR #5's frontend can drive it. Backend-only work inside `packages/demo/backend/`. No SDK, contracts, or frontend changes.

The backend stays a strictly thin proxy over the SDK, matching the existing convention established by `lend.ts` and `swap.ts` (zod validate, requireAuth, resolveAsset, pass through, decorate response with block explorer URLs). No business logic. No cross-domain checks.

## Why This Approach

Three forces pinned the design:

1. **PR #3 SDK shape (locked)**: 5 named wallet verbs (`openPosition`, `closePosition`, `depositCollateral`, `withdrawCollateral`, `repay`), 2 read methods (`getPrice`, `getQuote`), `BorrowMarketPosition` with health factor and liquidation price as first-class fields, `AmountExact` / `AmountWithMax` discriminated unions per #379, recipient-bound quotes that bake calldata.
2. **Existing backend convention**: Every controller in the repo is a transparent SDK proxy. Introducing business logic here would be a net-new pattern that future endpoints would copy.
3. **Issue #391 problem list**: structured errors over opaque 500s; schemas in sync with SDK; frontend (PR #5) must be able to drive every borrow flow.

The design point that follows: backend HTTP endpoints map 1:1 to SDK methods. Where SDK has 5 named verbs, backend has 5 named routes. Where SDK has `getPrice` + `getQuote`, backend has `POST /borrow/price` + `POST /borrow/quote`. Validation is zod (mirroring lend); auth and asset resolution mirror existing patterns.

## Endpoint Surface

```
GET   /borrow/markets                                          public
POST  /borrow/price                                            public
POST  /borrow/quote                                            public
GET   /wallet/borrow/:chainId/:marketId/position               auth

POST  /borrow/position/open                                    auth
POST  /borrow/position/close                                   auth
POST  /borrow/position/deposit-collateral                      auth
POST  /borrow/position/withdraw-collateral                     auth
POST  /borrow/position/repay                                   auth
```

### Request/response shapes (illustrative)

```ts
// POST /borrow/quote   (and /borrow/price with the same body)
{
  action: 'open' | 'close' | 'depositCollateral' | 'withdrawCollateral' | 'repay',
  marketId: { id: '0xabc...' /* bytes32 for Morpho */, chainId: 84532 },
  collateralAmount?: { amount: 100 } | { amountRaw: '100000000' },
  borrowAmount?:     { amount: 5 }   | { amountRaw: '5000000000000000000' } | { max: true },
  collateralAsset?: Address,         // required for Morpho fresh open per Decision 1
  recipient: Address,                // baked into quote bundle calldata (Decision 6)
}
  -> BorrowQuote   (per Decision 6: positionBefore/After, fees, execution.transactions[], expiresAt, ...)

// POST /borrow/position/open
{
  marketId: { id, chainId },
  collateralAmount?: AmountExact,
  borrowAmount: AmountExact,
  collateralAsset?: Address,
}
// OR (Decision 6 wallet methods accept either fresh params OR pre-built BorrowQuote)
{ quote: BorrowQuote }

  -> BorrowReceipt + { blockExplorerUrls }
```

Bigints serialize as decimal strings on the wire (existing `serializeBigInt` helper in `helpers/`).

## Key Decisions

### 1. Verb-per-route, params-or-quote bodies (locked)

5 mutation routes mirror the SDK's 5 wallet verbs 1:1. Each accepts either fresh params (zod-validated) or `{ quote: BorrowQuote }` as a discriminated union.

**Why over swap-style consolidated `/borrow/execute`:** SDK has 5 named verbs (not one). Exposing them as 5 routes preserves discoverability, OpenAPI clarity, and lets the frontend call `backend.borrow.openPosition(params)` directly without writing its own dispatcher. Swap consolidates because it has only one execute method.

**Why over params-only bodies (no quote acceptance):** SDK Decision 6 has wallet methods that explicitly accept either shape. Backend must mirror to avoid forcing the frontend to choose between SDK shapes. Quote acceptance preserves the recipient-bound calldata protection Decision 6 added (server doesn't re-quote, executes the bundle as-built).

### 2. POST for read endpoints (`/borrow/price`, `/borrow/quote`) (locked)

Diverges from `/swap/quote` (GET), forced by param complexity: nested `marketId`, discriminated `AmountExact` union, bigint serialization. Flattening to query params is lossy and verbose; JSON-encoded query is ugly. POST with body is the cleanest fit.

**Implication:** these endpoints aren't browser-cacheable. Acceptable for a demo backend; quote responses are time-bound (`expiresAt`) anyway.

### 3. HTTP status + freeform message for errors (locked)

```
{ error: 'Insufficient liquidity: 12.4 OP available' }
status: 422
```

No code field. HTTP status maps to category:
- 400 validation / chain mismatch / malformed input
- 401 unauthorized
- 403 market not allowed / quote recipient mismatch
- 404 position not found
- 409 collateral locked (if PR #4 owned this — not adopted; see decision 5)
- 410 quote expired
- 422 business rule (insufficient liquidity / collateral / health factor)
- 500 internal
- 503 provider unavailable

Backend translates SDK errors to status + message in the controller's `catch` block, replacing the current "everything is 500" pattern. Concrete mapping table lives in `helpers/errors.ts` extension during `/ce-plan`.

**Why over discriminated code envelope:** Demo, not platform. Localization is not in scope. Status + clear message is the YAGNI fit. If frontend needs to branch programmatically on error category, status alone is enough granularity for the four #391 categories.

### 4. Borrow request bodies omit token addresses (mirror SDK)

Bodies carry `marketId` + amounts (+ optional `collateralAsset` per Decision 1). Token addresses are derived outputs (returned in `BorrowMarketPosition.collateralAsset` / `.borrowAsset`), not inputs. Matches SDK Decision 2 / Decision 4 / forward-looking finding #2 ("borrowAsset is sometimes market-derived").

### 5. Collateral-locked guard lives in PR #5 frontend (locked)

PR #5 frontend reads `/wallet/borrow/:chainId/:marketId/position` before submitting `/lend/position/close`, computes `available = lendBalance - pledgedCollateral`, disables the Max button or surfaces a warning. Backend stays strictly thin.

**Why over PR #4 backend guard:** Adding a service-level cross-domain check in `lendService.closePosition` would break the thin-wrapper convention every existing controller follows. The architectural cost of introducing "business logic in backend" exceeds the safety benefit for a demo, especially when the frontend warning covers the realistic user path. PR #5 already lists this in its handoff problems.

**Trade-off accepted:** A rogue client (curl, custom UI) can attempt the close and get an opaque on-chain failure or unexpected partial outcome. Demo-acceptable. If real users surface the foot-gun, file a follow-up.

### 6. Wallet position path uses `:marketId`

`GET /wallet/borrow/:chainId/:marketId/position`

Lend uses `:marketAddress` because lend markets are vault contract addresses. For Morpho borrow, market is a `bytes32` hash, so `:marketId` is accurate. Future Aave borrow markets will use `(asset, chainId)` per forward-looking finding #3, which means the path may need a different shape (e.g., a single marketId encoding) when Aave lands. PR #4 ships only the Morpho variant.

### 7. Auth: mirror current router conventions

- Public: `/borrow/markets`, `/borrow/price`, `/borrow/quote` (recipient passed in body, frontend supplies)
- Auth: `POST /borrow/position/*`, `GET /wallet/borrow/...`

Quote recipient binding is enforced at SDK execution layer (Decision 6: "Wallet `execute` rejects mismatched quotes"), not at the backend HTTP layer. Backend passing the quote as-is preserves the binding.

### 8. Validation = zod, mirror lend's `validateRequest` helper

All bodies / query strings / path params pass through `validateRequest(c, schema)` (existing `helpers/validation.ts`). Zod schemas live in the controller file alongside the route handler, matching `lend.ts` layout.

### 9. Block explorer URL decoration mirrors lend

Mutation responses get `{ ...result, blockExplorerUrls }` via existing `getBlockExplorerUrls` helper. Read responses (`getMarkets`, `getPrice`, `getQuote`, `getPosition`) do not.

## File Layout (sketch, finalize during `/ce-plan`)

```
packages/demo/backend/src/
  controllers/
    borrow.ts                  # all 5 mutation handlers + getMarkets/getPrice/getQuote
  services/
    borrow.ts                  # thin SDK wrappers, 1:1 with controller methods
  config/
    markets.ts                 # add BorrowMarketConfig + ALL_BORROW_MARKETS
    actions.ts                 # wire BorrowProviders { morpho } into createActions
  controllers/wallet.ts        # add getBorrowPosition method
  router.ts                    # register all new routes
  types/borrow.ts              # request body / response types if not pulled from SDK
```

## Cross-PR Coordination Notes

- **PR #3 dependency:** `actions-sdk` must export `BorrowProvider`, `BorrowMarketId`, `BorrowQuote`, `BorrowPrice`, `BorrowMarketPosition`, `AmountExact`, `AmountWithMax` types as locked in PR #3 Decisions 2/3/4/6. Decision 5 (calldata pre-build validation surface) does not block PR #4; it's an SDK-internal concern that surfaces only as a typed error if validation fails.
- **PR #5 dependency:** Frontend will consume the BorrowQuote shape verbatim from `/borrow/quote` responses. If PR #5 surfaces missing data, file a follow-up rather than expanding PR #4 scope (per AGENTS.md "one domain per PR").
- **Markets allowlist:** lives in `config/markets.ts` (existing pattern), passed to `createActions`. SDK throws "market not allowed" naturally; backend translates to HTTP 403.

## Test Coverage (sketch, expanded in `/ce-plan`)

- Per-route happy path (unit + integration with mocked SDK).
- Validation failures (malformed body, missing required field, invalid bigint string).
- Auth failures (401 without idToken on mutation routes).
- SDK error → HTTP status mapping table (one test per category in the error mapping).
- Quote acceptance (params variant + `{ quote }` variant produce same call into wallet method).
- Wallet position read (Morpho marketId path resolves correctly, includes HF / liquidation price fields).

## Out of Scope (file as follow-ups if discovered)

- Aave borrow provider routes (PR #427 territory).
- Caching / rate limiting on `/borrow/price` (frontend will hit it on every keystroke; address if perf becomes visible).
- Server-side enforcement of quote `expiresAt` (rely on SDK; backend just forwards).
- WebSocket / SSE position-update streams.
- Backend-side risk warnings (HF projections, liquidation alerts) — frontend's job per PR #5.

## Resolved Questions

- Endpoint shape (verb-per-route + price/quote reads + position read).
- Mutation body shape (`params | { quote }` discriminated union per route).
- Read endpoint method (POST, body-encoded, not GET).
- Error envelope (HTTP status + freeform message; no code field).
- Collateral-locked guard placement (PR #5 frontend, backend stays thin).
- Token address presence in bodies (omitted; assets are derived outputs).
- Auth strategy (public reads, auth on mutations + wallet position).

## Open Questions

None blocking. Plan-level details to resolve during `/ce-plan`:

1. Exact zod schema for `AmountExact` / `AmountWithMax` (bigint-as-string serialization round-trip).
2. Concrete SDK error class → HTTP status mapping table (depends on PR #3 final error class names).
3. Whether `serializeBigInt` needs to handle `AmountWithMax` `{ max: true }` discriminator distinctly from `bigint` payloads.
4. Whether `/borrow/markets` returns a thinner shape than full SDK `BorrowMarket` for client efficiency, or 1:1 passthrough.
5. PR #3 Decision 5 (calldata pre-build validation surface): when it lands, decide whether backend exposes the helper or stays opaque.

---

## Next steps

`/ce-plan` translates this into implementation units, file paths, and test coverage. Then `/ce-work` ships, one small commit at a time per the handoff's commit discipline.

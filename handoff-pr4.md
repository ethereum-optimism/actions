# Handoff from PR #4 to PR #3 and PR #5

> **What this file is.** PR #4 (demo backend `/borrow` endpoints) is feature-complete and pushed as draft PR [#465](https://github.com/ethereum-optimism/actions/pull/465). This document captures the asks and known gaps that fall on PR #3 (SDK) or PR #5 (Frontend) so those agents can address them in their own scope.
>
> **Update 2026-05-12:** PR #3 shipped ASK-A1, ASK-A2, ASK-A3 and the `BorrowMarket.healthBufferPct` surface. PR #4 wired all of them in (see "Resolved" markers below). PR #5's two blockers (501 stubs on price/quote; explorer URL decoration) are also resolved. **Answers to PR #5's confirmation questions are in §"Confirmations for PR #5" below.**
>
> **Update 2026-05-13:** PR #3 landed an action-module registry refactor (`6d41a296`..`6f85e8eb`). Public `ActionsConfig` / `NodeActionsConfig` shape is unchanged; `lend` / `swap` / `borrow` / `assets` / `chains` / `wallet` keys all stay. PR #4 needed **no code changes** — clean rebase, build + 102 tests + lint all green. **Bonus side effect**: `wallet.borrow` is now exposed on hosted wallets (Privy / Turnkey / Dynamic), which closes the previously-flagged gap that would have made `resolveWalletOrThrow`'s `wallet.borrow` null-check throw on every Privy-authenticated mutation. PR #4 mutations are now end-to-end executable as soon as a real signer + deployed market are wired (already true on baseSepolia chain 84532).

## Confirmations for PR #5

Answering PR #5's list at `handoff-pr5.md` "Confirmations PR #5 needs from PR #4":

1. **Bigint wire format.** Yes, all `bigint` fields serialize to decimal strings via the SDK's `serializeBigInt` (every controller wraps responses in `c.json({ result: serializeBigInt(value) })`). PR #5 deserializes at the API boundary with `BigInt(field)`.
2. **Error envelope.** Yes, HTTP status + freeform `error` string, no `code` field. Bodies look like `{ error: 'Market is not in the allowlist.' }` with the status code carrying the category. SDK error classes are mapped to status by `helpers/errors.ts:mapSdkError` (see `handoff-pr4.md` table for the matrix). Borrow routes flow through the borrow-scoped `app.onError`; lend / swap keep their per-route 500s.
3. **`/borrow/price` recipient.** Public route, optional `walletAddress` in body (frontend passes the connected wallet address; field is `walletAddress`, not `recipient`). Sending an empty / missing address still works for hypothetical previews — the SDK validates downstream.
4. **`/borrow/markets` shape.** Returns `BorrowMarket[]` (the read shape, no `marketParams`). PR #4 calls `actions.borrow.getMarkets(params)` and passes the result through unchanged. If PR #5 needs `marketParams` for any reason, file a follow-up (the backend `MorphoBorrowDemo` config has them, but the public route exposes the read shape).
5. **`getBorrowPosition` — never null, never 404 for zero positions.** The SDK's `actions.borrow.getPosition` returns a `BorrowMarketPosition` object even when the wallet has no position (zero amounts, `healthFactor: null`, `ltv: null`). PR #4 passes it through verbatim. So the response is **always** 200 + position object. The only 404 case on this route is "wallet not found" (caller has no Privy embedded wallet — extremely rare for authenticated users). PR #5's stub returning `null` for "no position" diverges from this; the wire-up should switch to treating zero-amount positions as the empty state and branch on `position.borrowAmount === '0'` (string compare after JSON parse) rather than `position === null`.
6. **`{ quote }` body variant.** Yes, both variants stay accepted on every mutation route. The discriminated union is `params | { quote: BorrowQuote }` per route. PR #5's plan to use the `params` variant is fine — the backend re-quotes via the SDK's wallet method, which builds the quote internally and dispatches atomically. Sending `{ quote }` is the fast path if PR #5 ever wants user confirmation between quote-build and submit; currently no public quote-producing endpoint outside `/borrow/quote`, but `BorrowQuote` from that endpoint is exactly the shape that round-trips into the mutation bodies.
>
> **Read these sections first:**
> - PR #3 agents: §"Needs from PR #3 (SDK)"
> - PR #5 agents: §"Needs from PR #5 (Frontend)" + §"Wire contracts PR #5 must consume"
> - Anyone curious about PR #4 gaps: §"Known gaps in PR #4 itself"
>
> **Sibling worktree path on this machine:**
> `/Users/kevin/github/optimism/actions-borrow-pr4` on branch `kevin/borrow-pr4` (head `72d25d30` at time of writing).

## PR #4 status (for context)

Routes shipped (`packages/demo/backend/src/router.ts`):

```
GET   /borrow/markets                                        public
POST  /borrow/price                                          public  (501 stub — see ASK-A1)
POST  /borrow/quote                                          auth    (501 stub — see ASK-A1)
GET   /wallet/borrow/:chainId/:marketId/position             auth

POST  /borrow/position/open                                  auth
POST  /borrow/position/close                                 auth
POST  /borrow/position/deposit-collateral                    auth
POST  /borrow/position/withdraw-collateral                   auth
POST  /borrow/position/repay                                 auth
```

All five mutation routes accept either fresh params or `{ quote: BorrowQuote }`. SDK-error → HTTP-status mapping lives in `helpers/errors.ts` (`mapSdkError`) and is wired via a borrow-scoped `app.onError` global handler. Real Morpho Blue dUSDC/OP market wired in `config/markets.ts` (`MorphoBorrowDemo`).

102 unit + helper tests pass. Build clean. Lint clean. End-to-end against testnet works as soon as the demo deploy ran (it has, per `deployments.json`).

## Needs from PR #3 (SDK)

### ✅ ASK-A1 — Expose standalone quote-build on `actions.borrow` [RESOLVED]

**Resolved 2026-05-12.** PR #3 shipped `BaseBorrowNamespace.getQuote(BorrowQuoteParams)` and `.getPrice(BorrowQuoteParams)` discriminated by `action`. PR #4 wired both into `services/borrow.ts` (`getPrice`, `getQuote`) and replaced the controller 501 stubs with real handlers. `/borrow/price` is public and accepts an optional `walletAddress` in the body; `/borrow/quote` requires auth and derives `walletAddress` from the idToken (rejecting any body-supplied `walletAddress` with 400).

### ASK-A1 — Original ask (kept for context)

**Problem.** PR #4's `/borrow/price` and `/borrow/quote` are 501 stubs. The SDK's `actions.borrow` namespace exposes only `getMarket`, `getMarkets`, `getPosition`. The `BorrowProvider` base has `public async openPosition(params): Promise<BorrowQuote>` (and the other four verbs) that builds quotes without dispatching — but those methods are not surfaced on the read-only namespace.

**Impact on PR #5.** Frontend can't preview "if I borrow X, what's the new health factor?" without a quote endpoint. Per brainstorm v2 Decision 6, this was supposed to mirror swap's `getPrice` / `getQuote` pattern. Without it, the frontend must either (a) call `wallet.borrow.openPosition(params)` which executes, (b) compute HF projections client-side from market params + position, or (c) wait for ASK-A1.

**Suggested fix.** Add to `ActionsBorrowNamespace`:

```ts
async getQuote(params: BorrowOpenPositionParams | BorrowClosePositionParams | ...): Promise<BorrowQuote> {
  return this.getProviderForMarket(params.market).openPosition(params) // or the matching verb
}

async getPrice(params): Promise<BorrowPrice> {
  // lighter shape: no execution bundle
}
```

The provider methods already exist and return `BorrowQuote`. The namespace just needs to expose them. Discriminator on `action` selects which provider verb to dispatch.

Once shipped, PR #4 backend swap is a ~30-line change: replace the 501 stubs with `actions.borrow.getQuote(params)` / `getPrice(params)` calls. PR #4 already has the controller schemas, routes, auth wiring, and the body-recipient-from-idToken plumbing in place — just `errorResponse(501)` swaps for the real SDK call.

### ✅ ASK-A2 — Surface tx hashes on `BorrowReceipt` [RESOLVED]

**Resolved 2026-05-12.** PR #3 denormalized `transactionHash?`, `transactionHashes?`, `userOpHash?` onto the `BorrowReceipt` envelope. PR #4's mutation services now decorate every response via `decorateReceipt(receipt, chainId)` using the existing `getBlockExplorerUrls` helper — same pattern lend uses. Return type is `BorrowReceiptWithUrls = BorrowReceipt & { blockExplorerUrls: string[] }`.

### ASK-A2 — Original ask (kept for context)

**Problem.** `BorrowReceipt` shape (`types/borrow/base.ts:365-378`) carries `receipt: TransactionReturnType | BatchTransactionReturnType` plus `action`, amounts, `marketId`, `positionAfter?`. It does not directly expose `transactionHash` / `transactionHashes` / `userOpHash` at the top level the way `LendTransactionReceipt` does.

**Impact on PR #4 / #5.** Lend mutations decorate their responses with `blockExplorerUrls: string[]` via `getBlockExplorerUrls({ chainId, transactionHash, transactionHashes, userOpHash })` (see `services/lend.ts:54-62`). PR #4 currently cannot do this for borrow without a downcast on `receipt` to discriminate EOA vs UserOp shape. PR #5 will want the URLs in the receipt UI.

**Suggested fix.** Either:
- (a) Add top-level `transactionHash` / `transactionHashes` / `userOpHash` to `BorrowReceipt` (denormalized from the inner `receipt`).
- (b) Export a `getTxHashesFromReceipt(receipt: TransactionReturnType | BatchTransactionReturnType): { transactionHash?, transactionHashes?, userOpHash? }` helper.

(a) matches the lend precedent and lets backends decorate without import-time coupling to the internal receipt union.

### ✅ ASK-A3 — `as unknown as NodeActionsConfig<'privy'>` cast removed [RESOLVED]

**Resolved 2026-05-12.** PR #3 confirmed `NodeActionsConfig` already accepts `borrow?: BorrowConfig` via its `ActionsConfig` re-parameterization. PR #4 dropped the cast in `config/actions.ts`.

### ASK-A3 — Original ask (kept for context)

**Problem.** `packages/demo/backend/src/config/actions.ts:66` casts the literal because `NodeActionsConfig` did not previously accept a `borrow` key. PR #3 added `BorrowConfig` to `ActionsConfig` (`types/actions.ts:237`), so the cast is now redundant. **PR #4 will drop it as cleanup; flagged here in case `NodeActionsConfig` is a wrapper that still excludes the `borrow` field.** If so, PR #3 should extend `NodeActionsConfig` to mirror `ActionsConfig.borrow?`.

## Wire contracts PR #5 must consume

These are the body / response shapes the backend ships today. PR #5 must conform to them or coordinate a backend change.

### Mutation request bodies

All five mutation routes accept a discriminated union of two shapes:

**Variant A — fresh params:**

```ts
// POST /borrow/position/open
{
  marketId: { kind: 'morpho-blue', marketId: '0x<bytes32>', chainId: 84532 },
  borrowAmount: { amount: 5 } | { amountRaw: '5000000000000000000' },
  collateralAmount?: { amount: 100 } | { amountRaw: '100000000' },
  // no collateralAsset — backend resolves it from the market config
}

// POST /borrow/position/close   (AmountWithMax — accepts { max: true })
{ marketId, borrowAmount, collateralAmount? }

// POST /borrow/position/deposit-collateral   (AmountExact only)
{ marketId, amount }

// POST /borrow/position/withdraw-collateral  (AmountWithMax)
// POST /borrow/position/repay                (AmountWithMax)
{ marketId, amount }
```

Bigint values arrive on the wire as decimal strings; the schema `.transform()` converts to `bigint` before the SDK call.

**Variant B — pre-built quote (passthrough):**

```ts
{ quote: { action: 'open' | 'close' | 'depositCollateral' | 'withdrawCollateral' | 'repay', ...full BorrowQuote } }
```

Strict on the top level — `recipient` cannot be supplied here; SDK validates the quote's recipient against the wallet at execute time. Until ASK-A1 lands, no public endpoint produces a BorrowQuote, so Variant B is currently unreachable end-to-end.

### Mutation response

The raw SDK `BorrowReceipt`, serialized via `serializeBigInt` (bigint → decimal-string). **No `blockExplorerUrls` decoration yet** — see ASK-A2. Frontend can derive URLs client-side from `receipt.receipt.transactionHash` / `userOpHash` for now.

### Wallet position response

`GET /wallet/borrow/:chainId/:marketId/position` returns the full `BorrowMarketPosition` (per PR #3 Decision 4):

```ts
{
  marketId: BorrowMarketId,
  collateralAsset, collateralAmount (string), collateralAmountFormatted,
  borrowAsset, borrowAmount (string), borrowAmountFormatted,
  healthFactor: number | null,   // null when no debt (NOT Infinity — JSON can't serialize Infinity)
  liquidationPrice: string, liquidationPriceFormatted,
  borrowApy, liquidationBonus,
  ltv: number | null,            // null when no debt
  maxLtv
}
```

PR #5 must handle the `null` cases for `healthFactor` and `ltv`. Zero-position state (never-opened) is 200 with these `null`s, not 404.

### Markets response

`GET /borrow/markets[?chainId=84532]` returns `BorrowMarket[]` 1:1 from the SDK. Per-market shape includes `marketId`, `name`, `collateralAsset`, `borrowAsset`, `borrowApy`, `liquidationBonus`, `maxLtv`, `totalBorrowed`, `totalCollateral`. Filter by `chainId` works; `collateralAsset` / `borrowAsset` filters are not yet wired through the controller (SDK supports them — ask if needed).

### Error responses

HTTP status + freeform message (no code field). Mapped from SDK error classes via `mapSdkError`:

| Status | SDK error class |
|---|---|
| 400 | `MarketIdRequiredError`, `ChainNotSupportedError`, `AmountRequiredError`, `InvalidAmountError`, `ConflictingAmountsError` |
| 403 | `MarketNotAllowedError`, `QuoteRecipientMismatchError` |
| 404 | `MarketNotFoundError` |
| 410 | `QuoteExpiredError` |
| 422 | `BorrowMarketParamsMismatchError` |
| 501 | `/borrow/price` and `/borrow/quote` stubs (until ASK-A1) |
| 503 | `ProviderNotConfiguredError` |
| 500 | unmapped / generic Error fallback |

Message strings are static literals per class (no SDK message passthrough; prevents leakage of internal addresses / RPC URLs). PR #5 can prefix-match on these messages for localization, or branch on status.

### Auth shape

- Public: `/borrow/markets`, `/borrow/price`, `/borrow/quote` (the latter two are 501 stubs but the auth gate is wired).
- Auth: `POST /borrow/position/*` + `GET /wallet/borrow/.../position`. Auth uses `privy-id-token` header (existing pattern, identical to lend / swap).

When ASK-A1 ships and `/borrow/quote` becomes a real endpoint, **the recipient is derived from the authenticated idToken**, not from a body field — clients must not send `recipient` in the quote body (strict schema rejects with 400 if they do).

## Needs from PR #5 (Frontend)

### ASK-B1 — Own the collateral-locked guard on lend close

Per PR #3 / PR #4 brainstorm Decision 5 (re-confirmed by deepening): the check that blocks `/lend/position/close` from withdrawing dUSDC pledged as borrow collateral lives in **PR #5 frontend**, not in the backend. Backend stays a strict thin proxy; PR #4 ships zero cross-domain logic.

Implementation:
1. Before submitting `/lend/position/close`, call `GET /wallet/borrow/:chainId/:marketId/position` to learn `collateralAmount` (pledged dUSDC).
2. Compute `availableLendBalance = lendBalance - pledgedCollateralAmount`.
3. Disable Max / show warning if user tries to withdraw more than `availableLendBalance`.

A rogue client (curl, custom UI) bypassing this will hit an opaque on-chain failure — acceptable for the demo.

### ASK-B2 — Handle `healthFactor` / `ltv` `null` for zero-position state

`BorrowMarketPosition.healthFactor` and `.ltv` are `null` when no debt is outstanding (PR #3 Decision 4 changed this from `Infinity` because JSON can't serialize Infinity). Frontend must check `=== null` rather than `=== Infinity` for the "no debt" branch. The "no position at all" state is `borrowAmount: '0'` + `collateralAmount: '0'` (zero-position object), still 200 — not a 404.

### ASK-B3 — Compute HF preview client-side (until ASK-A1 lands)

`/borrow/price` returns 501 currently. PR #5's slider / preview UX needs HF projection. Options:

- (a) **Wait for ASK-A1**, then call `/borrow/price` per keystroke. Most accurate; matches plan intent.
- (b) **Compute client-side** from `actions.borrow.getPosition` + `BorrowMarketConfig.marketParams` (which include `lltv`, `oracle`, etc.). Less accurate (no live oracle re-read) but works today.

If PR #5 goes with (b), the preview is approximate; flag this in the UI ("estimate"). When ASK-A1 ships, swap to (a) and the backend `/borrow/price` becomes a one-line route handler.

### ASK-B4 — Bigint deserialization

Every numeric `bigint` field arrives as a decimal string on the wire (`serializeBigInt` replacer in the SDK). Frontend must `BigInt(field)` before doing math. Affects: `collateralAmount`, `borrowAmount`, `liquidationPrice`, `marketParams.lltv`, `totalBorrowed`, `totalCollateral`, `gasEstimate`, and `execution.transactions[].value` when quote bodies become reachable. `number` fields (`healthFactor`, `borrowApy`, `liquidationBonus`, `maxLtv`, `ltv`, `safeCeilingLtv`) stay as JS numbers.

### ASK-B5 — Use `BorrowMarketConfig.healthBufferPct` for safe-ceiling LTV (Decision 7)

Each market has an optional `healthBufferPct?: number`; if unset, fall back to `BorrowSettings.healthBufferPct` (global, default 0.05). Resolution rule: `market.healthBufferPct ?? settings.healthBufferPct ?? 0.05`. Frontend computes `safeCeilingLtv = market.maxLtv * (1 - resolvedBufferPct)` for the HF bar normalization and Max button prefill. Once ASK-A1 ships, `safeCeilingLtv` will come back directly on `BorrowQuote` / `BorrowPrice` and frontend can drop the manual computation.

## Known gaps in PR #4 itself (not blocking PR #3 / PR #5)

Updated 2026-05-12 after PR #3 unblocks landed:

- ✅ **Block explorer URL decoration on mutation responses.** Wired via `decorateReceipt` in `services/borrow.ts` once ASK-A2 landed.
- ✅ **`as unknown as NodeActionsConfig<'privy'>` cast** in `config/actions.ts:66` — removed.
- **Controller-level tests** still open. Service-layer + helpers covered (102 tests). No integration tests assert the Hono wiring end-to-end (zod 400, requireAuth 401, route-action 422 paths). If PR #5 surfaces a wiring bug, that's the gap.
- **`/borrow/markets` filter coverage.** Only `chainId` is wired through the controller; SDK supports `collateralAsset` / `borrowAsset` filters too. Frontend can filter client-side for now.
- **Single-market endpoint** `/borrow/market/:chainId/:marketId` — not in scope; frontend filters the `/borrow/markets` list.
- **Lend / swap retrofit to shared `helpers/schemas.ts` and `mapSdkError`.** User explicitly skipped this PR. File a follow-up if desired.

## Glossary

- **PR #2** = on-chain Morpho Blue borrow market deploy (merged into `kevin/borrow-pr3` via the pr3 branch).
- **PR #3** = `kevin/borrow-pr3`, SDK `BorrowProvider` + Morpho impl. Mostly finished; ASKs A1-A3 above.
- **PR #4** = `kevin/borrow-pr4`, this branch + draft [#465](https://github.com/ethereum-optimism/actions/pull/465).
- **PR #5** = `kevin/borrow-pr5`, demo frontend Borrow tab. ASKs B1-B5 above.
- **PR #6** = `kevin/borrow-pr6`, e2e polish + Aave provider follow-up.

## Source documents on this branch

- `docs/brainstorms/2026-05-08-borrow-pr4-backend-endpoints-brainstorm.md` — PR #4 design decisions.
- `docs/plans/2026-05-11-feat-borrow-pr4-backend-endpoints-plan.md` — PR #4 implementation plan (deepened, 596 lines).

PR #3's authoritative documents are in `/Users/kevin/github/optimism/actions-borrow-pr3/docs/`.

# PR #5 Status and Needs from PR #3 / PR #4

> **PR #5 status:** Draft at
> [ethereum-optimism/actions#466](https://github.com/ethereum-optimism/actions/pull/466).
> Frontend is functionally complete against an in-memory stub. **Blocked
> on PR #4** for the next deliverable (real-backend wire-up). Details
> below.

---

## What PR #5 is currently blocked on (read first)

PR #5's next deliverable is **swapping `api/borrowApi.ts` from an
in-memory mock to real `request<T>` calls against PR #4's `/borrow/*`
endpoints**. Per the PR #3 handoff
(`origin/kevin/borrow-pr3:handoff-for-pr4-pr5.md`), PR #4's controllers
currently 501-stub the read-side endpoints. PR #5 can't wire those
paths until they return real data.

### Blocking on PR #4

1. **Swap the 501 stubs on `POST /borrow/price` and `POST /borrow/quote`.**
   `controllers/borrow.ts:56-77` per the PR #3 handoff. These should
   dispatch to `actions.borrow.getQuote(params)` and
   `actions.borrow.getPrice(params)` (the namespace methods PR #3
   shipped at `9ba48c6a add namespace getQuote and getPrice`). Without
   these, PR #5's `BorrowAction` cannot switch its per-keystroke
   projection from local math to backend round-trips, and the Review
   modal cannot fetch a backend-authoritative `positionAfter`.

2. **Mutation responses must decorate with `blockExplorerUrls`** (PR #3
   handoff item). PR #5's success toast currently builds the explorer
   URL from a stub-generated hash. The wire-up will read
   `blockExplorerUrls` from the backend envelope; need confirmation
   the envelope is `{ ...receipt, blockExplorerUrls }` per the lend
   convention.

### Confirmations PR #5 needs from PR #4 (non-blocking, low effort)

These don't block wire-up but resolving them before the swap PR saves
churn:

- **Bigint serialization on the wire.** `BigInt` → decimal string per
  `serializeBigInt`? PR #5 will deserialize at the API boundary.
- **Error envelope shape.** HTTP status + freeform `message` (no `code`
  field) per the PR #4 plan? PR #5's `TransactionModal` will translate
  status → user-facing copy via a small `mapBackendError` helper.
- **`/borrow/price` recipient handling.** Endpoint is public; recipient
  comes in the body. PR #5 passes the connected wallet address.
- **`/borrow/markets` shape.** `BorrowMarket[]` (read shape) or
  `BorrowMarketConfig[]` (with `marketParams`)? PR #5's stub returns
  `BorrowMarket[]`; either works since extra fields are ignored, but
  consistency helps.
- **`getBorrowPosition` returning `null` vs 404.** PR #5's stub returns
  `null` for "no position." If the backend uses 404, the wire-up will
  catch it and translate.
- **`{ quote }` body variant on mutation endpoints.** PR #5's wire-up
  will use the `params` variant (frontend has no reason to pre-build
  quotes since the backend re-quotes on submit). Confirm both variants
  remain accepted.

### Not blocked on PR #3

All PR #3 blocking items PR #5 originally raised are **resolved and
adopted**:

- ✅ `BorrowMarket.healthBufferPct: number` (precomputed) — adopted in
  `3a88e325 adopt borrow market health buffer`. Frontend now reads
  `market.healthBufferPct` directly across `BorrowAction`,
  `BorrowPositions`, lend's `Action.tsx` withdraw mode, and
  `borrowApi.ts` quote/price.
- ✅ `BorrowReceipt.transactionHash?` (denormalized) — adopted. Mock
  `successReceipt` populates the top-level field; the `as unknown` cast
  on the underlying `receipt` is the only remaining shim (acceptable
  for a stub; the real receipt comes from the SDK at wire-up time).
- ✅ `actions.borrow.getQuote` / `getPrice` namespace methods — shipped
  on PR #3, ready for PR #4 to wire.

### Open on PR #3 (non-blocking)

- **`actions.borrow.getMarketConfig(marketId)`** so direct-SDK callers
  can resolve a `BorrowMarketConfig` from a `BorrowMarketId`. PR #5
  doesn't need it (goes through the backend), flagging for PR #6.
- **USD price oracle.** PR #5 hardcodes USDC = $1, OP = $0.10 in
  `stubPriceUsd` for the projection math. The real flow goes through
  `getPrice` so prices stay server-side. Not blocking; flagging.

---

## What PR #5 commits to once unblocked

- **One-file wire-up swap.** `borrowApi.ts` method bodies swap from
  in-memory mock to `request<T>(...)` calls. No consumer changes.
- **Backend-mismatch protocol.** If wire-up reveals a shape gap PR #4
  hadn't anticipated, PR #5's author files the gap as a PR #4
  follow-up rather than silently expanding `borrowApi.ts` with
  adapters.

---

## Reference

- PR #5 draft: [#466](https://github.com/ethereum-optimism/actions/pull/466)
- PR #5 brainstorm: `docs/brainstorms/2026-05-08-borrow-pr5-frontend-tab-brainstorm.md`
- PR #5 plan: `docs/plans/2026-05-11-feat-demo-frontend-borrow-tab-plan.md`
- PR #3 outgoing handoff (lists PR #4's to-dos): `origin/kevin/borrow-pr3:handoff-for-pr4-pr5.md`
- PR #4 brainstorm: `docs/brainstorms/2026-05-08-borrow-pr4-backend-endpoints-brainstorm.md`
- PR #4 plan: `docs/plans/2026-05-11-feat-borrow-pr4-backend-endpoints-plan.md`

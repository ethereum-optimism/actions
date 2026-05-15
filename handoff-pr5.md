# PR #5 Status and Outstanding Work

> **PR #5 status:** Draft at
> [ethereum-optimism/actions#466](https://github.com/ethereum-optimism/actions/pull/466).
> The Borrow tab is now wired to PR #4's real backend endpoints.
> **Previously-blocking items from PR #3 and PR #4 are resolved and
> adopted on this branch.**

---

## Resolved

### From PR #3 (SDK)

- ✅ `BorrowMarket.healthBufferPct: number` (precomputed per-market) — adopted in `3a88e325 adopt borrow market health buffer`. Frontend reads `market.healthBufferPct` directly across `BorrowAction`, `BorrowPositions`, lend's `Action.tsx` withdraw mode, and `borrowApi.ts`.
- ✅ `BorrowReceipt.transactionHash?` / `transactionHashes?` / `userOpHash?` denormalized on the envelope — adopted. Mock `successReceipt` populates the top-level fields.
- ✅ `actions.borrow.getQuote` / `getPrice` namespace methods shipped on PR #3.

### From PR #4 (backend)

- ✅ `POST /borrow/price` and `POST /borrow/quote` are no longer 501 stubs — wired against `actions.borrow.getQuote/getPrice`.
- ✅ Mutation responses decorated with `blockExplorerUrls` via `decorateReceipt(receipt, chainId)`.
- ✅ Confirmations answered (per PR #4's `handoff-pr4.md` §"Confirmations for PR #5"):
  - Bigint = decimal strings via `serializeBigInt`; frontend deserializes with `BigInt(field)` at the boundary.
  - Error envelope = `{ error: 'message' }` + HTTP status code. No `code` field.
  - `/borrow/price` body field is `walletAddress` (not `recipient`).
  - `/borrow/markets` returns `BorrowMarket[]` (read shape).
  - `getBorrowPosition` always returns 200 + zero-position object when no debt (`borrowAmount: '0'`, `healthFactor: null`, `ltv: null`). Frontend must check `borrowAmount === '0'`, not `null`.
  - Both `params` and `{ quote }` mutation bodies accepted; PR #5 will use `params`.

---

## Landed on this branch

### Real backend HTTP wire-up

`packages/demo/frontend/src/api/borrowApi.ts` now calls PR #4's real
`/borrow/*` and `/wallet/borrow/*` endpoints. The client mirrors
`ActionsApiClient` with:

- `request<T>`-style fetch wrapper
- all read + mutation endpoints implemented
- bigint deserialization at the API boundary
- auth header threading through `BorrowProviderContextProvider`
- zero-position responses collapsed to `null` in the frontend layer

### Backend-driven HF preview

`BorrowAction.tsx` now calls `getPrice(...)` with a 250 ms debounce and
uses `positionAfter` for live LTV / health-factor preview. Local
`stubPriceUsd` math remains only for synchronous USD display and Max
prefill fallback.

### Done: B1 collateral-locked Max button

Per PR #4's ASK-B1, the lend Withdraw Max button must subtract pledged collateral so users can't try to withdraw more than `lendBalance - pledgedCollateralAmount`. Implemented alongside this handoff update.

### Already done

- B2 `healthFactor` / `ltv` `null` for zero-position — adopted via SDK type swap.
- B5 `healthBufferPct` resolution — frontend reads `market.healthBufferPct` (PR #3 precomputed-on-read).

## Remaining follow-ups

- Shared per-stage loading-state refactor across Lend / Swap / Borrow is still out of scope here.
- Dynamic / Turnkey borrow execution path still depends on the broader wallet-path architecture; this branch uses the backend HTTP flow already wired through the current provider setup.

---

## Reference

- PR #5 draft: [#466](https://github.com/ethereum-optimism/actions/pull/466)
- PR #5 brainstorm: `docs/brainstorms/2026-05-08-borrow-pr5-frontend-tab-brainstorm.md`
- PR #5 plan: `docs/plans/2026-05-11-feat-demo-frontend-borrow-tab-plan.md`
- PR #4 outgoing handoff: `origin/kevin/borrow-pr4:handoff-pr4.md`
- PR #3 outgoing handoff: `origin/kevin/borrow-pr3:handoff-for-pr4-pr5.md`

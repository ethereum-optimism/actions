# PR #5 Status and Outstanding Work

> **PR #5 status:** Draft at
> [ethereum-optimism/actions#466](https://github.com/ethereum-optimism/actions/pull/466).
> Frontend is functionally complete against an in-memory stub. **All
> previously-blocking items from PR #3 and PR #4 are resolved.** The
> next deliverable (real-backend HTTP wire-up) is now unblocked but is
> scoped as the next PR; see "Outstanding work" below for the path.

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

## Outstanding work (PR #5 to-do, next PR)

### Primary: real-backend HTTP wire-up

Swap `packages/demo/frontend/src/api/borrowApi.ts` from the in-memory mock to real `request<T>` calls against PR #4's `/borrow/*` endpoints. Mirrors the existing `ActionsApiClient` pattern in `api/actionsApi.ts`. Scoped as the next PR because it requires answering an architecture question first:

**Wallet-path divergence.** Borrow today works for all wallet types (Dynamic / Turnkey / Privy) against the in-memory stub. With real wire-up:

- **Privy server-wallet:** backend HTTP works end-to-end. Auth via `privy-id-token` header (see `EarnWithPrivyServerWallet.tsx:75-81` for the `getAuthHeaders` pattern).
- **Dynamic / Turnkey frontend wallets:** PR #3's handoff notes `wallet.borrow.*` isn't yet exposed on `HostedProviderDeps.borrowProviders` due to a TS declaration-emit inference depth issue. Until that lands, frontend wallets have no SDK-direct borrow path.

**Two options for the wire-up PR:**

1. **Privy-first, others-on-stub.** Wire `borrowApi.ts` HTTP for Privy. Detect wallet type at provider-context level; route Dynamic / Turnkey to the in-memory stub. Ships Borrow tab usable for Privy users today, falls back gracefully for others. Mirrors how lend / swap operate today (server-wallet path via `actionsApi`; frontend-wallet path via SDK).
2. **Operations-injection pattern (like lend).** Define `BorrowOperations` interface. `EarnWithFrontendWallet` and `EarnWithPrivyServerWallet` each construct their own implementation (frontend = SDK direct once available; server = backend HTTP). Provider context takes injected operations. Cleaner long-term; requires `wallet.borrow.*` to exist for the frontend path, which it doesn't yet. Acceptable for Privy-only ship; ergonomic when SDK closes the gap.

Lean: option 1 first, refactor to 2 when SDK unblocks. Either way, this is one focused PR.

**Wire-up checklist** (to be carried into that PR):

- [ ] `BorrowBackendClient` class with `request<T>(endpoint, options)`, mirroring `ActionsApiClient`.
- [ ] All 9 endpoints implemented (`getMarkets`, `getPrice`, `getQuote`, `getPosition`, 5 mutations).
- [ ] BigInt deserialization at the boundary for `collateralAmount`, `borrowAmount`, `liquidationPrice`, `totalBorrowed`, `totalCollateral`, `gasEstimate`, `execution.transactions[].value`.
- [ ] Auth header threading via `getAuthHeaders` prop on `BorrowProviderContextProvider`.
- [ ] Zero-position handling: `borrowAmount === '0'` is the empty state (200 + zero-position object), not `null`.
- [ ] Error mapping: HTTP status → user-facing message in `TransactionModal` via a small `mapBackendError(status, message)` helper.
- [ ] Decision on wallet-path divergence (see options above).

### Secondary: switch HF preview from local math to `/borrow/price`

Per-keystroke projection currently computes locally in `BorrowAction.tsx` from hardcoded prices (`stubPriceUsd`). Once the backend wire-up is in, `BorrowAction` can call `borrowApi.getPrice(...)` on amount change and consume `BorrowPrice.positionAfter`. Removes the hardcoded USD prices.

Debounce 200ms on the input change to avoid per-keystroke fetches.

### Done: B1 collateral-locked Max button

Per PR #4's ASK-B1, the lend Withdraw Max button must subtract pledged collateral so users can't try to withdraw more than `lendBalance - pledgedCollateralAmount`. Implemented alongside this handoff update.

### Already done

- B2 `healthFactor` / `ltv` `null` for zero-position — adopted via SDK type swap.
- B5 `healthBufferPct` resolution — frontend reads `market.healthBufferPct` (PR #3 precomputed-on-read).

---

## Reference

- PR #5 draft: [#466](https://github.com/ethereum-optimism/actions/pull/466)
- PR #5 brainstorm: `docs/brainstorms/2026-05-08-borrow-pr5-frontend-tab-brainstorm.md`
- PR #5 plan: `docs/plans/2026-05-11-feat-demo-frontend-borrow-tab-plan.md`
- PR #4 outgoing handoff: `origin/kevin/borrow-pr4:handoff-pr4.md`
- PR #3 outgoing handoff: `origin/kevin/borrow-pr3:handoff-for-pr4-pr5.md`

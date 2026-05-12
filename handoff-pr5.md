# PR #5 Needs from PR #3 (SDK) and PR #4 (Backend)

> **Status:** PR #5 is in draft at
> [ethereum-optimism/actions#466](https://github.com/ethereum-optimism/actions/pull/466).
> Frontend is functionally complete against an in-memory stub. The
> backend-wire-up commit is intentionally deferred until the items below
> are resolved or confirmed compatible.
>
> Everything below is **actionable for PR #3 or PR #4**. Items split by
> owner; "Nice to have" items are non-blocking and can ship in a
> follow-up. **Blocking** items need to land before PR #5 can wire to the
> real backend.

---

## For PR #3 (SDK borrow types and provider)

### Blocking

- **Expose the resolved `healthBufferPct` somewhere a read-only consumer
  can reach.** Today the buffer lives on `BorrowMarketConfig` (with the
  resolution rule `market.healthBufferPct ?? settings.healthBufferPct ?? 0.05`),
  but the frontend only ever sees `BorrowMarket` (the read-side shape from
  `actions.borrow.getMarkets()`). PR #5's Health card and Max button
  need the resolved value per market. Two options that work for us:
    1. Add `healthBufferPct: number` to `BorrowMarket` itself (precomputed by
       the provider at read time using the resolution rule). Cleanest for
       consumers.
    2. Expose `actions.borrow.settings.healthBufferPct` as a publicly
       readable value, and let consumers do the per-market resolution
       themselves. Requires the frontend to also have access to
       `BorrowMarketConfig.healthBufferPct` overrides; harder.
  Either way, today the frontend stubs `BORROW_HEALTH_BUFFER_PCT = 0.05`
  in `packages/demo/frontend/src/config/borrow.ts`. That swap-site has
  a `TODO(actions config)` marker.

### Nice to have

- **Resolve `BorrowMarketId` → `BorrowMarketConfig` from the SDK.** PR #5
  never holds `BorrowMarketConfig` (the actions config is consumed by
  the SDK internally), only `BorrowMarketId` (from `BorrowMarket.marketId`).
  But the SDK's wallet methods (`wallet.borrow.openPosition`, etc.) take
  `BorrowOpenPositionParams` whose `market` field is the full
  `BorrowMarketConfig`. If a future PR wants the frontend to call SDK
  wallet methods directly (instead of going through the backend),
  there's no clean path today. Possible fixes:
    - `actions.borrow.getMarketConfig(marketId: BorrowMarketId): BorrowMarketConfig`
    - Or change wallet method params to accept `BorrowMarketId` and resolve
      the config internally.
  Not blocking PR #5 because the frontend talks to the backend, not the
  SDK directly. Flagging in case PR #6 (Aave) or any direct-SDK consumer
  hits the same gap.

- **`BorrowReceipt.receipt` is the raw underlying receipt type
  (`TransactionReturnType | BatchTransactionReturnType`).** Useful for
  power consumers but heavy for typical UI needs (toast with
  transaction hash + block explorer link). PR #4's backend already
  decorates with `blockExplorerUrls` at the response envelope, so the
  frontend doesn't actually parse `receipt` directly today. If a future
  consumer needs `transactionHash` ergonomically, consider adding
  `BorrowReceipt.transactionHash?: Hex` precomputed.

- **USD price oracle.** PR #5 hardcodes USDC = $1 and OP = $0.10 in
  `packages/demo/frontend/src/api/borrowApi.ts` (`stubPriceUsd`) for the
  projection math (live HF preview as user types). The eventual real
  flow is "frontend calls `getPrice` on input change, backend returns
  `positionAfter`" so prices stay server-side. But if any consumer
  wants USD aggregates without round-tripping a `getPrice` call, an
  asset-price endpoint or SDK helper would be useful. Not blocking;
  documented as a stub.

---

## For PR #4 (demo backend `/borrow/*` endpoints)

### Blocking

- **None.** All endpoints PR #5 needs are shipped per PR #4's brainstorm:
  ```
  GET  /borrow/markets                                     public
  POST /borrow/price                                       public
  POST /borrow/quote                                       auth
  GET  /wallet/borrow/:chainId/:marketId/position          auth
  POST /borrow/position/open                               auth
  POST /borrow/position/close                              auth
  POST /borrow/position/deposit-collateral                 auth
  POST /borrow/position/withdraw-collateral                auth
  POST /borrow/position/repay                              auth
  ```
  PR #5's `borrowApi.ts` is shape-compatible with these. The
  wire-up PR will replace each method body with a `request<T>`
  call against the corresponding route; no consumer changes.

### Nice to have (would speed the eventual wire-up)

- **Confirm bigint serialization on the wire matches the existing
  `serializeBigInt` convention** (`BigInt` → decimal string). PR #5's
  stub returns `bigint` directly because it's in-process; the wire-up
  will deserialize strings back to bigint at the API boundary. If PR #4
  uses a different convention (e.g. `0x`-prefixed hex, or numeric where
  unsafe), flag.

- **Confirm error envelope is HTTP status + freeform `message`** (no
  code field) per PR #4 plan. PR #5's wire-up will translate the
  status into a localized message via a small `mapBackendError(status, message)`
  helper. Not blocking; flagging only because PR #5's
  `TransactionModal` currently shows `ActionsError.shortMessage` for
  Lend errors, and a similar pattern is wanted for borrow.

- **`/borrow/price` recipient handling.** Per PR #4 plan, `POST /borrow/price`
  is public and takes `recipient: Address` in the body. PR #5 will pass
  the connected wallet address. If the endpoint instead derives
  recipient from the auth context (despite being public), flag — the
  frontend doesn't authenticate `/borrow/price` calls today (lighter
  per-keystroke fetches).

- **`/borrow/markets` shape: `BorrowMarket[]` (read shape) or
  `BorrowMarketConfig[]` (config shape with `marketParams`)?** PR #5's
  stub returns `BorrowMarket[]`. The `marketParams` field is only
  needed by the SDK to encode calldata; the frontend doesn't read it.
  If the backend returns `BorrowMarketConfig[]`, that's a strictly
  bigger shape and the frontend still works (extra fields ignored), so
  not blocking. Flagging for consistency.

- **`getBorrowPosition` returning `null` vs 404.** PR #5's stub returns
  `null` from `getPosition` when no position exists. If the backend
  returns HTTP 404 instead, the wire-up needs to catch it and translate
  to `null`. Document the chosen convention.

- **`{ quote }` body variant on mutation endpoints.** PR #4 plan
  describes mutation routes accepting either `params` or `{ quote }`.
  PR #5 today only uses the `params` variant (stub doesn't bake calldata
  ahead of time). Both branches are accepted; the wire-up will continue
  to use `params` since the frontend has no reason to pre-build quotes
  given the backend re-quotes on submit anyway.

---

## What PR #5 commits to in return

- **One-file wire-up swap.** When the above blocking items resolve, the
  `borrowApi.ts` method bodies swap from in-memory mock to
  `request<T>(...)` calls. No changes to consumers
  (`useBorrowProvider`, `BorrowProviderContext`, `useCollateralStatus`,
  `BorrowAction`, etc.). The frontend already uses real PR #3 SDK types
  (`BorrowMarket`, `BorrowMarketPosition`, `BorrowQuote`, `BorrowPrice`,
  `BorrowReceipt`, `Amount`, `AmountOrMax`, `BorrowAction`) directly.

- **Buffer stub one-liner swap.** `BORROW_HEALTH_BUFFER_PCT` in
  `packages/demo/frontend/src/config/borrow.ts` becomes a read of
  whatever resolution shape PR #3 ships. Frontend consumers
  (`BorrowHealthCard`, `BorrowAction`, lend's `Action.tsx` withdraw mode)
  all read the constant via a single import; once-and-done swap.

- **Naming conventions.** Activity log uses
  `BORROW_ACTIONS = { 'borrow', 'repay', 'getBorrowMarkets', 'getBorrowPosition' }`.
  Distinct namespace; matches PR #4's apiMethod conventions.

- **Backend-mismatch protocol.** If the wire-up reveals a shape gap PR #4
  hadn't anticipated, PR #5's author will file the gap as a follow-up
  PR #4 issue, not silently expand `borrowApi.ts` with adapters.

---

## Reference

- PR #5 brainstorm: `docs/brainstorms/2026-05-08-borrow-pr5-frontend-tab-brainstorm.md`
- PR #5 plan: `docs/plans/2026-05-11-feat-demo-frontend-borrow-tab-plan.md`
- PR #5 draft PR: [#466](https://github.com/ethereum-optimism/actions/pull/466)
- PR #4 brainstorm (for cross-ref): `docs/brainstorms/2026-05-08-borrow-pr4-backend-endpoints-brainstorm.md`
- PR #4 plan (for cross-ref): `docs/plans/2026-05-11-feat-borrow-pr4-backend-endpoints-plan.md`
- PR #3 brainstorm (for cross-ref): `docs/brainstorms/2026-05-08-borrow-pr3-sdk-borrow-provider-brainstorm.md`

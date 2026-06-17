---
title: "refactor: Split PriceQuote from SwapQuote (sentinel recipient leak)"
type: refactor
status: active
created: 2026-06-16
issue: its-applekid/actions#8
---

# refactor: Split PriceQuote from SwapQuote

## Summary

`actions.swap.getQuote(...)` (no wallet bound) returns a `SwapQuote` whose
`recipient: Address` field is the Universal Router `msg.sender` sentinel
(`0x0000000000000000000000000000000000000001`) when no recipient is supplied.
The type says "ready to execute" but the value is un-executable and, worse,
a footgun for any consumer that reads `quote.recipient` for display,
accounting, or analytics.

This plan implements **Option B** from the issue: split the return type.
`actions.swap.getQuote` returns a new **`PriceQuote`** (pricing, amounts,
route, metadata — **no** `recipient`, **no** `execution`, **no**
`approvalMode`), making it structurally un-executable. `wallet.swap.getQuote`
keeps returning the full `SwapQuote` (recipient required, execution present).
`wallet.swap.execute` already only accepts `SwapQuote`.

**Approach chosen:** B over A/C. The issue recommends B long-term and it best
serves the stated motivation (price-display consumers get a smaller, honest
surface). Validated against consumers: the demo's `executeSwap` re-quotes from
raw params via `wallet.swap.execute` and never executes an actions-level quote,
so the `execution` data on price quotes is already dead weight. Dropping it
breaks no execution path.

---

## Problem Frame

- **Root cause:** `SwapProvider.resolveQuoteDefaults` (`packages/sdk/src/actions/swap/core/SwapProvider.ts:274`) defaults `recipient` to `UNIVERSAL_ROUTER_MSG_SENDER` when none is supplied. The provider bakes this into `execution.swapCalldata` and returns it as `SwapQuote.recipient`.
- **Only the no-wallet path is affected:** `SwapQuoteParams` is shared by both namespaces, but `WalletSwapNamespace.getQuote` injects `wallet.address` before delegating, so a provider only ever sees an empty recipient on the `actions.swap.getQuote` path.
- **Post-#434 reality:** an actions-level quote already throws at `wallet.swap.execute` (recipient mismatch via `QuoteRecipientMismatchError`), so its `execution`/`recipient` fields are a trap, not a feature.

---

## Scope Boundaries

In scope:
- New `PriceQuote` type and the `SwapQuote = PriceQuote & {...}` relationship.
- Namespace return-type split (actions → `PriceQuote`, wallet → `SwapQuote`).
- Updating SDK consumers (CLI, demo backend/frontend) and tests.
- Public export of `PriceQuote` from the SDK barrel.

### Deferred to Follow-Up Work
- **Encoder defense-in-depth guard** (refuse the sentinel on Velodrome v2/leaf encoders). The issue notes this "follows naturally from B/A" but is a separate hardening change; keep this PR focused on the type split. File as a follow-up if not already tracked.

Out of scope / non-goals:
- Changing how providers internally encode calldata (sentinel stays valid Universal Router encoding internally).
- Touching `borrow`/`lend` quote types.

---

## Key Technical Decisions

1. **`SwapQuote` extends `PriceQuote`.** Define `PriceQuote` as the display/pricing subset; define `SwapQuote = PriceQuote & { recipient: Address; execution: SwapQuoteExecution; approvalMode?: ApprovalMode }`. This keeps a single source of truth for the shared fields and makes `SwapQuote` assignable to `PriceQuote` (wallet quotes satisfy price-quote consumers for free).

2. **Strip at the namespace boundary, not in providers.** Providers keep returning full internal `SwapQuote`s (they need a recipient to encode calldata; sentinel default stays as an internal encoding detail). `ActionsSwapNamespace` maps results through a `toPriceQuote()` stripper. Minimal, surgical — no provider/encoding changes, no `_getQuote` restructuring.

3. **Make base routing methods protected.** `BaseSwapNamespace.getQuote/getQuotes` become `protected resolveQuote/resolveQuotes` returning `SwapQuote`. Each namespace exposes its own public method with the correct return type. Required because a covariant override cannot widen the return type from `SwapQuote` to `PriceQuote`.

4. **`PriceQuote` → `execute` fails at runtime, not compile time.** `PriceQuote` is structurally assignable to `WalletSwapParams` (it has the required `assetIn`/`assetOut`/`chainId`), so `execute(params: WalletSwapParams | SwapQuote)` accepts it at compile time as raw params. But a `PriceQuote` carries the `quotedAt` discriminator, so `execute` routes it down the pre-built-quote path, where the missing `recipient` makes `requireQuoteForThisWallet` throw. The protection is therefore runtime (fail-loud), covered by a regression test — not a type error.

---

## Implementation Units

### U1. Define `PriceQuote` and re-base `SwapQuote`

**Goal:** Introduce the honest price-only type and express `SwapQuote` in terms of it.

**Files:**
- `packages/sdk/src/types/swap/base.ts` (modify)
- `packages/sdk/src/index.ts` (export `PriceQuote`)

**Approach:**
- Extract the shared pricing/amount/route/metadata fields of the current `SwapQuote` into `interface PriceQuote` — i.e. everything except `recipient`, `execution`, `approvalMode`.
- Redefine `SwapQuote` as `PriceQuote & { recipient: Address; execution: SwapQuoteExecution; approvalMode?: ApprovalMode }` (or an `interface SwapQuote extends PriceQuote` with those three added).
- Carry over the precision JSDoc note onto `PriceQuote`. Document on `PriceQuote` that it is intentionally un-executable; re-quote via `wallet.swap.getQuote` to execute.
- Export `PriceQuote` from the SDK barrel alongside `SwapQuote`.

**Patterns to follow:** existing `SwapQuote`/`SwapQuoteExecution` JSDoc style in `base.ts`; export ordering in `index.ts`.

**Test scenarios:** Test expectation: none — pure type definition. Coverage comes from the type-level consumers in U2–U4 compiling and from existing namespace specs.

---

### U2. Split namespace return types

**Goal:** `actions.swap.getQuote/getQuotes` return `PriceQuote`; `wallet.swap` keeps `SwapQuote`.

**Dependencies:** U1

**Files:**
- `packages/sdk/src/actions/swap/namespaces/BaseSwapNamespace.ts` (modify)
- `packages/sdk/src/actions/swap/namespaces/ActionsSwapNamespace.ts` (modify)
- `packages/sdk/src/actions/swap/namespaces/WalletSwapNamespace.ts` (modify)
- `packages/sdk/src/actions/swap/namespaces/__tests__/BaseSwapNamespace.spec.ts` (modify)
- `packages/sdk/src/actions/swap/namespaces/__tests__/WalletSwapNamespace.spec.ts` (modify)

**Approach:**
- In `BaseSwapNamespace`, rename public `getQuote`→`protected resolveQuote` and `getQuotes`→`protected resolveQuotes` (return `SwapQuote`/`SwapQuote[]`). Internal routing helpers (`getBestQuote`, `fetchAllQuotes`) stay on `SwapQuote`.
- Add a small `toPriceQuote(quote: SwapQuote): PriceQuote` mapper (destructure-and-drop `recipient`/`execution`/`approvalMode`). Place it where both can't accidentally leak — a module-local helper near `ActionsSwapNamespace` or a `swap` util; prefer the namespace file unless a shared util already fits.
- `ActionsSwapNamespace`: add public `getQuote(params): Promise<PriceQuote>` and `getQuotes(params): Promise<PriceQuote[]>` that call `resolveQuote`/`resolveQuotes` and map through `toPriceQuote`.
- `WalletSwapNamespace`: change `getQuote`/`getQuotes` overrides to call `resolveQuote`/`resolveQuotes` (instead of `super.getQuote`), still injecting `recipient ?? wallet.address`. Return type stays `SwapQuote`.

**Patterns to follow:** existing override pattern in `WalletSwapNamespace`; `BaseNamespace` visibility conventions.

**Test scenarios:**
- `actions.swap.getQuote` result has no `recipient`/`execution`/`approvalMode` keys (assert absence) and carries price/amount/route fields. Covers the core leak fix.
- `actions.swap.getQuotes` returns an array of stripped `PriceQuote`s, still sorted by `amountOutRaw` desc.
- With `routing: 'price'`, `actions.swap.getQuote` still returns the best-priced quote (stripped).
- `wallet.swap.getQuote` still returns a `SwapQuote` with `recipient === wallet.address` and `execution` present.
- `wallet.swap.getQuote` with an explicit `recipient` keeps that recipient.
- Type-level: passing an `actions.swap.getQuote` result to `wallet.swap.execute` is a compile error (document via a `// @ts-expect-error` assertion test or a type-only test).

---

### U3. Update CLI consumers

**Goal:** CLI compiles and prints price quotes without referencing dropped fields.

**Dependencies:** U1, U2

**Files:**
- `packages/cli/src/output/printOutput.ts` (modify — `formatSwapQuote` and the `SwapQuote` typing at lines ~116, ~312–327)
- `packages/cli/src/commands/actions/swap/quote.ts` (modify)
- `packages/cli/src/commands/actions/swap/quotes.ts` (modify)
- `packages/cli/src/commands/actions/swap/util.ts` (review — param-building comment about `SwapQuoteParams`)
- `packages/cli/src/commands/__tests__/swapQuote.test.ts` (modify)

**Approach:**
- The `actions swap quote`/`quotes` commands print results — retype those code paths to `PriceQuote`. Either loosen `formatSwapQuote` to accept `PriceQuote` (wallet `SwapQuote` is assignable to it) and guard any `recipient`/`execution` printing, or add a dedicated `formatPriceQuote`. Prefer loosening to `PriceQuote` if the formatter doesn't print execution/recipient; add a `formatPriceQuote` only if it does and the fields are wanted for the wallet path.
- Verify the wallet swap quote command path still receives `SwapQuote` and prints recipient as before.

**Patterns to follow:** existing `printOutput.ts` formatter registry and per-type formatters.

**Test scenarios:**
- `runSwapQuote`/`runSwapQuotes` still call `actions.swap.getQuote(s)` with built params and print without error on a `PriceQuote`-shaped object.
- If a `formatPriceQuote` is added: it renders price/amounts/route and does not print a `recipient` line.

---

### U4. Update demo consumers

**Goal:** Demo backend/frontend compile against the split types.

**Dependencies:** U1, U2

**Files:**
- `packages/demo/backend/src/services/swap.ts` (modify — `getQuote` return type `SwapQuote`→`PriceQuote` at line 45; import)
- `packages/demo/frontend/src/hooks/useSwap.ts` (modify — quote display typing)
- `packages/demo/frontend/src/api/actionsApi.ts` (review/modify)
- `packages/demo/frontend/src/components/earn/SwapAction.tsx` (review)
- `packages/demo/frontend/src/components/earn/frontendWalletOperations.ts` / `serverWalletOperations.ts` (review)
- `packages/demo/backend/src/utils/serializers.ts` (review — if it serializes a swap quote, ensure dropped fields aren't required)

**Approach:**
- Backend `getQuote` (price path) returns `PriceQuote`. `executeSwap` is unaffected (it re-quotes from raw params via `wallet.swap.execute`).
- Frontend: the price-quote display type becomes `PriceQuote`. Confirm the execute flow uses raw params (server/frontend wallet operations), not the displayed quote object — adjust types accordingly. If any frontend code currently reads `quote.recipient`/`quote.execution` from the price path, remove that usage (it was reading the sentinel / dead data).

**Patterns to follow:** existing demo serializer/formatter patterns; keep raw-param execute flow intact.

**Test scenarios:**
- `packages/demo/frontend/src/components/earn/EarnWithFrontendWallet.spec.ts` and any swap-quote test still pass with the stripped price-quote shape.
- Test expectation for pure type-narrowing edits with no behavior change: none — covered by typecheck + existing specs.

---

## System-Wide Impact

- **Public API change:** `actions.swap.getQuote(s)` return type narrows from `SwapQuote` to `PriceQuote`. This is a breaking type change for SDK consumers who relied on `recipient`/`execution` from the no-wallet path — but those fields were either the sentinel (un-trustworthy) or un-executable post-#434. A changeset entry should call this out.
- **Affected packages:** `sdk`, `cli`, `demo`. Three of three workspace packages compile against the change.
- **No runtime behavior change** for execution: wallet execute paths re-quote or require a wallet-bound `SwapQuote` exactly as before.

---

## Verification

- `pnpm typecheck && pnpm lint && pnpm test` green from repo root (zero new warnings/errors per AGENTS.md baseline rule).
- A changeset added describing the breaking type change (`pnpm changeset` convention — check `.changeset/` for format).
- Manual CLI exercise: run `actions swap quote` (price path — confirm output has no recipient/sentinel) and a `wallet swap quote` (confirm recipient present), per AGENTS.md "Manual CLI verification before opening a PR".

---

## Deferred / Open Questions (execution-time)

- Exact placement of `toPriceQuote` (namespace-local vs shared `swap` util) — decide when touching the files; prefer namespace-local unless a shared util already exists.
- Whether `formatSwapQuote` is loosened in place or a `formatPriceQuote` is added — depends on whether the formatter prints `recipient`/`execution` (inspect at implementation time).
- Whether a follow-up issue for the encoder defense-in-depth guard already exists in the tracker; file one if not.

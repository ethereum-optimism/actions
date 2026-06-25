# Reconcile frontend/backend config parity and stub-price fail-open

> **AUGMENT existing issue #482 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| | |
|---|---|
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | frontend (demo) |
| **Surface** | `packages/demo/frontend/src/config/actions.ts:37-39` (Morpho lend allowlist), `:67-92` (chains array); `packages/demo/frontend/src/hooks/useTotalBalance.ts:49-71,89-90` (portfolio price); `packages/demo/frontend/src/utils/borrowValuation.ts:17-32` + `utils/stubPrices.ts:14-18` + `utils/borrowMath.ts:61` (stub price → Infinity HF); `packages/demo/frontend/src/utils/tokenDisplay.ts:56-77` (derived USD rates); `packages/demo/frontend/src/providers/ActivityLogProvider.tsx:45-52` (storage key); `packages/demo/frontend/src/demoMagic/ReacquireDebtNotice.tsx:20` (repay hint) |
| **Resolves findings** | F316, F311, F312, F313, F324, F326 |
| **Candidate existing issue** | #482 |
| **Blocked by** | (none) |

This is a **review-only, no-refactor** demo-frontend ticket. Every finding here is low-severity display/config drift, not a signing-path or fund-movement bug. The asks are config alignment plus fail-closed hardening of demo display helpers; no architectural refactor of the portfolio/borrow/swap surfaces is in scope. Findings F311/F312/F313 are already tagged to #482 (the PriceProvider retirement that removes stub pricing wholesale); F316/F324/F326 are new neighbors on the same demo-display surface and are folded in here as additional color on that issue.

## Problem

These are all demo-display and demo-config drift items. None builds executable calldata (the signing path is constructed server-side or by the in-browser SDK from authoritative raw amounts, not from these formatter/config helpers), so there is no direct fund-loss vector. The fund-safety framing is that each one can **misrepresent fund state to the user before they decide to move funds**, and one (F312) is a structural fail-open: an unpriced asset values a real-debt position at $0 and renders it as a health-factor of Infinity, i.e. "never at liquidation risk." On allowlisted markets that path is not reachable today, but the default direction is wrong (fail-open, not fail-closed), and that is the hazard #482 should close when it retires stub pricing.

The config-parity half (F316) is a maintenance/consistency hazard: the frontend and backend demo allowlists are meant to mirror each other but have silently diverged in both the Morpho lend market symbol and the chains array, so a reviewer cannot confirm parity by name and a future allowlist change to one config will not track the other.

## Findings

- **F316** (low, info) — `config/actions.ts:38` sets `lend.morpho.marketAllowlist` to `[GauntletUSDCDemo]` while the backend `packages/demo/backend/src/config/actions.ts:39` uses `[MorphoUSDCLendDemo]` for the apparently-same vault (the `0x018e22BB…` address matches `MorphoUSDCBorrowOPDemo.marketParams.collateralToken`, `markets.ts:66`); separately the frontend `chains` array (`config/actions.ts:67-92`) lists only baseSepolia + optimismSepolia, while the backend includes UNICHAIN as well. Divergent symbols/chains mean a change to one config won't track the other and parity can't be confirmed by name. No fund-safety impact today — the allowlists are SDK-enforced regardless of demo config and the frontend only operates the two listed chains — but the configs are meant to mirror ("matching backend structure", `config/actions.ts:18`) and drifted silently.
- **F311** (low, info) — `useTotalBalance.ts:49-55` derives a per-token USD price by requesting a swap quote for `amountIn: 1` and uses `quote.amountOut` as the unit price (`:89-90` `balance * price`); the unit price embeds the 1-unit trade's pool impact and is then extrapolated linearly to the full balance, misrepresenting realizable value for larger holdings. The price is cached per symbol with no TTL (`priceCache` ref), so the nav/portfolio total drifts from market without refresh. Display-only — no transaction is built from it — but it can mislead a user about portfolio value before they move funds.
- **F312** (low, info) — `borrowValuation.ts:19-26` `positionUsd` multiplies formatted amounts by `stubPriceUsd(symbol)`, which (`stubPrices.ts:14-18`) returns `0` for any symbol absent from the hardcoded `{USDC, OP, ETH, WETH}` table (with `_DEMO` stripping). A zero `borrowValueUsd` makes `computeHealthFactor` return `Infinity` (`borrowMath.ts:61` — `if (borrowValueUsd <= 0) return Infinity`), so a position with real debt renders as fully safe / never liquidatable. Not reachable today (borrow markets allowlisted to in-table assets), but the default is **fail-open** (0 → Infinity HF) rather than fail-closed.
- **F313** (low, info) — `tokenDisplay.ts:64-74` `deriveUsdRates` prices the non-stable leg from the opposite leg of the same swap (`usdPerIn = amountOut/amountIn`), so the Review modal's "You pay" and "You receive" USD figures are equal by construction (`paidUSD == receivedUSD`) regardless of price impact; the USD readout can never signal an unfavorable trade. Known demo simplification, but it is a fund-relevant display that cannot surface value lost to impact/fees.
- **F324** (low, info) — `ActivityLogProvider.tsx:45-52` builds the storage key as `activity-log-${walletAddress}` only when the address is truthy, else falls back to `activity-log-${walletProvider}` or `activity-log`. Server-wallet/Turnkey/Dynamic resolve the address asynchronously, so activity logged in the pre-address window (and the `${key}-next-id` counter) lands under the provider-shared key; on a shared browser profile a second user of the same provider hydrates from that key (effect at `:78-99` swaps keys only once the address resolves) and reads the prior user's transaction-typed rows, including block-explorer URLs disclosing the prior user's addresses/tx hashes. Display/privacy only (no funds move), but it leaks per-user activity across sessions.
- **F326** (low, info) — `ReacquireDebtNotice.tsx:20` interpolates `maxRepayable` raw into "You can repay up to ${maxRepayable} ${symbol}". `maxRepayable` is `Math.min(debtBalance, outstandingDebt)` (`BorrowAction.tsx:118`), both parseFloat-derived floats; the amount input is floored to asset decimals via `floorToAsset` before submit (`BorrowAction.tsx:127-131,208`) but this advisory text is not, so a value like `12.3456789012` displays and (unfloored) reads slightly higher than the floored input would accept. Display-only, no tx impact, but it slightly over-states repayable funds in a fund-state hint.

## Root cause

Two independent root causes share this surface:

1. **Config drift (F316).** The frontend and backend demo action configs were authored to mirror each other but are maintained as two separate literals with no shared source of truth, so the Morpho lend market got renamed on one side and a chain (UNICHAIN) was added on only the backend without the other tracking it.

2. **Stub display pricing with a fail-open default (F311/F312/F313, plus the display hints F324/F326).** The demo intentionally stubs prices instead of using a real price oracle (the thing #482 introduces). The stubs take shortcuts that are fine for a happy-path demo but wrong-by-default: a 1-unit swap quote stands in for a market price (F311), an absent symbol returns `0` instead of failing closed (F312), and a leg's USD is back-derived from the other leg of the same trade so the two sides are always equal (F313). F324 and F326 are the same "demo display is approximate" theme — a storage key that isn't user-scoped until the address resolves, and a repay hint that isn't floored to the same precision the input enforces.

## Recommended approach

All items are **review-only / no-refactor**; do them as small surgical changes folded into #482's scope, not a rework of the portfolio/borrow/swap surfaces.

- **F316 (config parity).** Align the frontend and backend Morpho lend allowlists on a single market constant — rename to one shared name or import the same symbol so a name-level diff confirms parity. For the chains array, decide whether UNICHAIN is intentionally omitted on the frontend; if so, leave a one-line comment documenting the intentional omission so the divergence reads as deliberate, not drift.
- **F311 (portfolio price).** When #482's read-only PriceProvider lands, source the nav/portfolio price from it rather than an executable 1-unit swap quote, and give the cache a TTL. Until then, no code change is required — this is display-only and tracked under #482.
- **F312 (stub fail-open → fail-closed).** This is the one structural hazard. When stub pricing is retired under #482, an unpriceable asset must **fail closed**: omit or disable the health-factor / projection rendering for that position rather than defaulting to `$0` borrow value and an Infinity health factor. Do not ship a "real" price path that preserves the `0 → Infinity-HF` default. No change is needed while #482 is pending and markets stay allowlisted to priced assets, but the fail-closed direction is the acceptance bar for the #482 work.
- **F313 (per-leg USD).** Under #482, price each swap leg independently so the confirm modal's "You pay" / "You receive" USD figures can diverge and reflect value lost to impact/fees. No change while the demo intentionally stubs prices.
- **F324 (activity-log key).** Gate both the initial `localStorage` read and persistence until `walletAddress` is known, or namespace the provider-fallback key per session, so the pre-address window cannot write to (or read from) a provider-shared key. Small, self-contained provider-level fix.
- **F326 (repay hint).** Format `maxRepayable` through the same floor-to-asset-decimals helper (`floorToAsset`) used for the input — or a shared `formatAmount` — before passing it to `ReacquireDebtNotice`, so the hint never reads above the floored amount the input accepts.

## Affected files

- `packages/demo/frontend/src/config/actions.ts:18,37-39,67-92` — Morpho lend allowlist symbol + chains array
- `packages/demo/backend/src/config/actions.ts:39` — backend Morpho lend allowlist (parity reference, read-only)
- `packages/demo/frontend/src/config/markets.ts:17,66` — `GauntletUSDCDemo` / `MorphoUSDCBorrowOPDemo.collateralToken` (the same `0x018e22BB…` address under two names)
- `packages/demo/frontend/src/hooks/useTotalBalance.ts:49-71,89-90` — 1-unit-quote portfolio price + untimed cache
- `packages/demo/frontend/src/utils/borrowValuation.ts:17-32` — `positionUsd` via `stubPriceUsd`
- `packages/demo/frontend/src/utils/stubPrices.ts:14-18` — `stubPriceUsd` returns `0` for unknown symbols
- `packages/demo/frontend/src/utils/borrowMath.ts:61` — `borrowValueUsd <= 0 → Infinity` health factor
- `packages/demo/frontend/src/utils/tokenDisplay.ts:56-77` — `deriveUsdRates` back-derived leg pricing
- `packages/demo/frontend/src/providers/ActivityLogProvider.tsx:45-52,78-99` — storage key fallback + key-swap effect
- `packages/demo/frontend/src/demoMagic/ReacquireDebtNotice.tsx:20` — unfloored `maxRepayable` interpolation
- `packages/demo/frontend/src/components/earn/borrow/BorrowAction.tsx:118,127-131,208,322` — `maxRepayable` source and `floorToAsset` precedent

## Acceptance criteria / tests

- **F316:** Frontend and backend Morpho lend allowlists resolve to the same market under a single shared constant/name (diffable by name), and the chains-array divergence (UNICHAIN) is either reconciled or documented with an inline rationale. A reviewer can confirm parity without resolving addresses by hand.
- **F312 (fail-closed):** Under #482, a borrow position whose collateral or borrow asset symbol is not priceable renders with health/projection **disabled or omitted** — assert that an unpriceable symbol does not produce a finite-looking "safe" health card and never yields `borrowValueUsd === 0 → HF === Infinity` as a displayed "safe" state. Regression test: a position with a non-table symbol does not render a passing health bar.
- **F324:** Logging activity before the wallet address resolves does not write to (and the panel does not hydrate from) a provider-shared key. Test: with an async-resolving provider, an activity logged pre-address is not visible to a second session of the same provider, and the post-resolve key swap still loads the correct user's rows.
- **F326:** The "You can repay up to X" hint renders the same decimal-floored value the amount input accepts (no more fractional digits than the asset's decimals). Test: a `maxRepayable` with excess precision is displayed floored to asset decimals.
- **F311 / F313:** No code change required while stub pricing stands; covered by #482's PriceProvider acceptance (read-only oracle price for the portfolio total with a TTL'd cache; per-leg independent USD pricing in the swap confirm modal). Note these as the display-side acceptance bar for #482.
- Existing demo-frontend lint / typecheck / build pass; no signing-path or calldata behavior changes.

## Notes

- None of these touch the signing path. The executable calldata is built from authoritative raw amounts server-side or by the in-browser SDK, not from these demo formatter/config helpers, which is why every finding is low/info and review-only.
- F311/F312/F313 were filed against #482 (the PriceProvider that retires stub pricing). This ticket augments #482 rather than opening new work — fold F316/F324/F326 in as adjacent demo-display cleanups and treat F312's fail-closed requirement as a hard acceptance bar for the #482 implementation.
- F316's UNICHAIN omission may be intentional (the frontend operates only two Sepolia chains); confirm with the demo owner before adding UNICHAIN to the frontend — the deliverable there may be a documenting comment, not a config change.
- Related lifecycle finding F315 (borrow review modal renders live, non-snapshotted projection) shares the stub-priced projection (F312/F313) but is the snapshot/lifecycle angle and is tracked separately, not in this ticket.

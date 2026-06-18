# Match pledged collateral by on-chain address not symbol on fund-moving withdraw paths

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | frontend |
| **Surface** | `useCollateralStatus` symbol match, `useWithdrawCollateral` ceil-division shares, `actionsApi` lend `tokenAddress` fallback |
| **Resolves findings** | F321, F323, F318 |
| **Candidate existing issue** | none |
| **Blocked by** | (none) |

## Problem

The Lend tab's withdraw path moves collateral out of an open borrow position. Three places on that path identify the position and size the release using weaker keys than the SDK already has on hand, and all three lean on a property of the current allowlist (unique symbols, every market carrying its chain address) rather than on the on-chain identity sitting right next to them.

1. `useCollateralStatus` picks which borrow position a lend withdraw releases collateral from by matching the human-readable `symbol` plus "the lend asset has *some* address on the position's chain" — it never compares the actual collateral token address to the lend asset's address on that chain. The selected position feeds a real `borrowOperations.withdrawCollateral(...)`. If two configured assets ever share a symbol on a chain (a bridged vs native variant, or two markets wrapping the same symbol), the withdraw can release collateral from the wrong borrow market.
2. `useWithdrawCollateral.releaseCollateralAmountRaw` converts the underlying withdraw amount into vault shares with **ceil** division, releasing up to one share-wei *more* collateral than the underlying being withdrawn. That is the non-conservative direction for a collateral release: it weakens the borrow position marginally more than the floor-rounded health card projected. There is also no clamp to the position's `collateralShares`, so a client-side over-input encodes an out-of-range release and relies entirely on the SDK/contract to revert.
3. The lend body builder sets `tokenAddress: asset.address[marketId.chainId]` with no fallback, while the sibling that resolves the same address for display/gating falls back to `Object.values(market.asset.address)[0]`. A missing chain entry yields `undefined`, `JSON.stringify` drops the key, and the POST goes out with no `tokenAddress` — the two derivations of the same token address can silently disagree.

None of these are exploitable against today's allowlist (unique symbols, full address coverage, backend 400s on a missing `tokenAddress`). They are symbol-/no-fallback-based identity and non-conservative rounding on fund-moving paths where an address-based, floor-rounded, clamped alternative is already available in the same scope.

## Findings

- **F321** (low, correctness) — `packages/demo/frontend/src/hooks/useCollateralStatus.ts:26-30`: the pledged-position filter matches `p.collateralAsset.metadata.symbol === asset.metadata.symbol && asset.address?.[p.marketId.chainId] !== undefined`, never comparing the position's collateral token address to the lend asset's address on that chain; `positions[0]` flows into `useWithdrawCollateral` and on to a real `withdrawCollateral` against `pledgedPosition.marketId`.
- **F323** (low, correctness) — `packages/demo/frontend/src/hooks/useWithdrawCollateral.ts:125-129`: `releaseCollateralAmountRaw` ceil-divides shares (`numerator = collateralAmountRaw * collateralShares + collateralAmount - 1n; / collateralAmount`), releasing up to one share-wei more than withdrawn; the guard at `:122` only rejects non-positive inputs and there is no clamp to `pledgedPosition.collateralShares`, while `exceedsDeposit` (`:102-103`) keys off the lend `maxAmount` rather than the pledged collateral, so the two gates can diverge.
- **F318** (low, correctness) — `packages/demo/frontend/src/api/actionsApi.ts:119`: `lendMutation` builds the `/lend/position/{action}` body with `tokenAddress: asset.address[marketId.chainId]` and no fallback, so a missing chain entry omits the key entirely; the sibling derivation at `packages/demo/frontend/src/hooks/useWalletBalance.ts:132-133` falls back to `Object.values(market.asset.address)[0]`, so the executed body's `tokenAddress` can diverge from the displayed/gated one.

## Root cause

All three reach for the convenient key (display symbol, a per-chain address lookup that can be `undefined`) and round in the direction that is simplest rather than the direction that is conservative for the holder of the position. The on-chain collateral address, the position's `collateralShares` balance, and the sibling's chain-address fallback are all in scope at each call site; the code just does not use them. The safety net today is the shape of the allowlist, not the code.

## Recommended approach

Review-only, no architectural refactor (demo frontend). These are tightening edits to existing filters and one-line arithmetic changes, each behavior-neutral for the current allowlist.

- **F321** — in the `useCollateralStatus` filter, additionally compare the resolved collateral address for the position's chain: require `asset.address?.[p.marketId.chainId]` to equal the position's collateral token address (alongside, or instead of, the symbol check). This narrows an over-broad filter; it does not change which position is selected for the current unique-symbol allowlist.
- **F323** — round shares-to-release **down** (floor) so a release never frees more collateral than the underlying withdrawn, and clamp the result to `pledgedPosition.collateralShares` so a client-side over-input cannot encode an out-of-range release. Both are one-line changes; floor-rounding also matches the conservative direction the health card already projects. Optionally align the `exceedsDeposit` gate so it cannot pass an amount the pledged collateral cannot cover, but the clamp is the load-bearing fix.
- **F318** — apply the same chain-address fallback the sibling uses (`Object.values(asset.address)[0]`), or assert `asset.address[marketId.chainId]` is present and throw a clear client error before building the body, so the executed `tokenAddress` can never silently differ from the displayed/gated one. Single line.

Keep the changes surgical: tighten the filter, floor + clamp the shares, add the fallback/assert. No restructuring of the withdraw hooks or the API client.

## Affected files

- `packages/demo/frontend/src/hooks/useCollateralStatus.ts:26-30` — symbol-only position filter (F321)
- `packages/demo/frontend/src/hooks/useWithdrawCollateral.ts:122` — non-positive-only guard (F323)
- `packages/demo/frontend/src/hooks/useWithdrawCollateral.ts:125-129` — ceil-division shares, no clamp (F323)
- `packages/demo/frontend/src/hooks/useWithdrawCollateral.ts:102-103` — `exceedsDeposit` keyed off lend `maxAmount` (F323, divergence)
- `packages/demo/frontend/src/api/actionsApi.ts:119` — lend `tokenAddress` with no fallback (F318)
- `packages/demo/frontend/src/hooks/useWalletBalance.ts:132-133` — sibling fallback reference (F318)
- `packages/demo/frontend/src/components/earn/Action.tsx:193-198` — passes `pledgedPosition.marketId` + `releaseCollateralAmountRaw` (downstream, context)
- `packages/demo/frontend/src/hooks/useLendProvider.ts:443-446` — real `withdrawCollateral` dispatch (downstream, context)

## Acceptance criteria / tests

- `useCollateralStatus` returns no pledged position when a lend asset's resolved address on the position's chain differs from the position's collateral token address, even when the symbols match; the current single-allowlist-symbol behavior is unchanged (regression test with two same-symbol assets on one chain, one securing a borrow).
- `releaseCollateralAmountRaw` floor-rounds: for any underlying withdraw amount the returned shares never exceed `ceil`'s result and never exceed `pledgedPosition.collateralShares`; an over-input amount clamps to `collateralShares` rather than producing an out-of-range value (unit test on the shares math).
- `lendMutation` always sends a defined `tokenAddress`: either it equals the sibling-resolved address (fallback applied) or the call throws a clear client error before the POST; a body with `tokenAddress` omitted can no longer be produced (unit test with an asset missing the market chain's entry).
- Existing Lend/withdraw and lend-mutation tests still pass with no behavior change for the current allowlist.

## Notes

- Severity is low because the current allowlist (unique symbols, full per-chain address coverage, backend rejecting a missing `tokenAddress`) contains all three; these are consistency/conservatism fixes on fund-moving paths, not active mis-send bugs.
- F321 and F323 share one call site (`useWithdrawCollateral` selects `positions[0]` from `useCollateralStatus`, then sizes the release), so fixing identity and rounding together keeps the withdraw path internally consistent.
- F318 mirrors the F321/F323 theme on the lend open/close body builder: use the on-chain address the sibling already resolves rather than a lookup that can silently yield `undefined`.
- No SDK or backend change required; this is entirely in the demo frontend.

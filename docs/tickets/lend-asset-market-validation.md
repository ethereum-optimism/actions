# Validate lend caller asset against market underlying and enforce blocklist/allowlist

> **AUGMENT existing issue #334 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | high |
| **Complexity** | 4 / 5 |
| **Domain** | lend |
| **Surface** | `LendProvider.openPosition`/`getMarkets`, `validateMarketAsset`/`validateMarketAllowed`, `isMarketAsset`, `BorrowProvider.getMarkets` |
| **Resolves findings** | F008, F010, F081, F102, F126, F016 |
| **Candidate existing issue** | #334 |
| **Blocked by** | (none) |

## Problem

`LendProvider.openPosition` builds an ERC-20 `approve(spender, amount)` to the routed market (vault/pool) and signs it. The asset that gets approved is whatever the caller passed in `params.asset`, but the asset the vault actually pulls on deposit is the vault's own fixed underlying. `closePosition` guards this by calling `validateMarketAsset(market, params.asset)`; `openPosition` does not. So `openPosition({ asset: WETH, marketId: <USDC vault>, amount })` emits a WETH approval to a USDC vault: the wallet grants a (max-mode) allowance on the unintended token, the deposit reverts, and the granted allowance survives the revert. That is the high-severity fund-safety leg of this ticket.

The same surface has three more fail-open or no-op guards that the SDK already has the information to close:

- `marketBlocklist` is a declared, address-validated config field that no lend path reads, so a developer who blocklists a market still has open/close/getMarket build and sign against it.
- `validateMarketAllowed` short-circuits to a no-op when `marketAllowlist` is empty/undefined, so an empty allowlist fail-opens to arbitrary caller-supplied `marketId.address` on the signing path.
- `getMarkets` forwards a caller-supplied `markets[]` verbatim, bypassing the allowlist prefilter (read-path twin of the write-path gap; same shape exists on `BorrowProvider.getMarkets`).
- `isMarketAsset` (the validator behind the close-path asset guard) compares possibly-`undefined` per-chain addresses with raw `===`, so `undefined === undefined` passes an asset not even configured on the market's chain, and is case-sensitive unlike the sibling `lendMarketIdMatches`.

Net: the open/close asymmetry plus a no-op asset comparator means a mismatched or off-chain asset reaches signed approval calldata, and two declared safety lists (blocklist, allowlist) are inert in their default/empty state.

## Findings

- **F008** (high, fund-loss) — `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118`: `openPosition` never calls `validateMarketAsset(market, params.asset)`, while `closePosition` does (`:204-206`); for Morpho the deposit calldata carries no asset arg, so a mismatched caller asset produces an `approve(vault, amount)` on the wrong token plus a reverting deposit, leaving the unintended-token allowance granted.
- **F010** (medium, correctness) — `packages/sdk/src/actions/lend/core/LendProvider.ts:234-257`: `validateMarketAllowed` consults only `marketAllowlist`; `marketBlocklist` is declared at `packages/sdk/src/types/lend/base.ts:201` and address-validated but has zero references anywhere under `src/actions/lend/`, so a blocklisted market is still openable/closable.
- **F081** (medium, malicious-sign) — `packages/sdk/src/actions/lend/core/LendProvider.ts:237-242`: when `marketAllowlist` is empty/undefined, `validateMarketAllowed` returns early (no-op), so open/close build `approve` + deposit to an arbitrary caller-supplied `marketId.address` (fail-open on the signing path).
- **F102** (low, info) — `packages/sdk/src/actions/lend/core/LendProvider.ts:141-154`: `getMarkets` passes `params.markets || filteredMarkets` (`:152`) straight to `_getMarkets`, so a caller `markets[]` bypasses the allowlist prefilter; the read path is fail-closed (per-market re-check throws on empty allowlist) while the write path (F081) fail-opens — an inconsistency to reconcile when F081 is fixed.
- **F126** (low, correctness) — `packages/sdk/src/actions/lend/utils/markets.ts:70-76`: `isMarketAsset` returns `marketAssetAddress === providedAssetAddress` on values that are `undefined` when neither asset has an entry for `market.marketId.chainId`, so `undefined === undefined` is `true` and an off-chain asset passes the close-path guard; the compare is also case-sensitive unlike `lendMarketIdMatches` (`:18-23`).
- **F016** (low, correctness) — `packages/sdk/src/actions/borrow/core/BorrowProvider.ts:215-236`: `getMarkets` passes `params.markets ?? filtered` (`:235`) to `_getMarkets` with no per-call allowlist/blocklist check, the borrow-surface twin of F102; `GetBorrowMarketsParams.markets` is a public field that lets a caller surface arbitrary reserve/oracle addresses as a "market" (read-only, no signing).

## Root cause

`openPosition` and `closePosition` implement different method contracts on the same class: close validates the caller asset against the resolved market underlying, open does not. Underneath, the validator that close relies on (`isMarketAsset`) is itself incomplete — it does not reject `undefined` resolved addresses and is case-sensitive — so even the path that does call it can be fooled. Separately, the two declared safety lists are enforced inconsistently: `marketAllowlist` is checked but fail-opens when empty, and `marketBlocklist` is never checked at all. The `getMarkets` override (`params.markets`) is trusted verbatim on both lend and borrow, bypassing the same allowlist prefilter the rest of the surface keys on. All of these are missing-obvious-validation or fail-open-where-the-SDK-already-knows: the SDK already resolves the market, already has `validateMarketAsset`, and already declares both lists.

## Recommended approach

All changes are within the SDK (SDK refactor allowed). Close the open/close symmetry, make the asset comparator total, and make both lists enforce as declared.

1. **`openPosition` asset symmetry (F008):** after `validateMarketAllowed`, fetch the market and call `validateMarketAsset(market, params.asset)` before building the deposit/approval, mirroring `closePosition` (`:204-206`). Reject mismatches with `MarketNotAllowedError` (the existing asset-mismatch error). This is the high-severity leg: it stops the wrong-token max-mode approval from ever being built.

2. **`isMarketAsset` totality + casing (F126):** reject when either resolved per-chain address is `undefined`, and compare case-insensitively via `isAddressEqual` (or `.toLowerCase()`) to match `lendMarketIdMatches` (`markets.ts:18-23`). This hardens both the existing close-path guard and the new open-path guard from step 1 in one place — do this before/with step 1 so the new open guard is not built on a comparator that passes `undefined === undefined`.

3. **Enforce `marketBlocklist` (F010):** consult `marketBlocklist` inside `validateMarketAllowed` (reuse `findMatchingConfig` + `lendMarketIdMatches`) and throw `MarketNotAllowedError` on a blocklist hit, before the allowlist check. A blocklisted market must be rejected on open/close/getMarket. (If product decides the field should not exist, the alternative is removing it from `LendProviderConfig` + `validateAddresses` rather than leaving it inert — flag for the issue, but enforcement is the lower-risk default since the field is already documented and validated.)

4. **Reconcile the empty-allowlist fail-open (F081):** decide and document one semantics for an empty/undefined `marketAllowlist`. The fail-closed read path (per-market re-check throws) is the safer reference; align the write path (`open`/`close`) so an empty allowlist is not a silent allow-all on the signing path. At minimum, document the intended behavior at the `validateMarketAllowed` early-return so the open/close vs read divergence (F102) is no longer silent. Whatever semantics is chosen must be identical for read (`getMarkets`/`getMarket`) and write (`open`/`close`).

5. **Constrain the `getMarkets({ markets })` override (F102 lend, F016 borrow):** intersect a caller-supplied `markets[]` with the allowlist (and apply the blocklist) before reading, or mark the field internal-only and drop it from the public `GetLendMarketsParams`/`GetBorrowMarketsParams` types. Apply the same fix on both `LendProvider.getMarkets` (`:141-154`) and `BorrowProvider.getMarkets` (`:215-236`) so the two sibling read paths stay consistent. This is read-only (no signing), so it is the lowest-priority leg, but it should land with the rest to keep the allowlist meaning one thing across the surface.

This ticket stays inside the missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency scope. No RPC-trust hardening (integrators bring their own RPC), no speculative intent-guessing, and no broad refuse-to-sign: the fix is to run a guard the sibling method already runs, make a comparator the SDK already calls correct, and enforce two lists the config already declares.

## Affected files

- `packages/sdk/src/actions/lend/core/LendProvider.ts:84-118` — `openPosition` missing `validateMarketAsset` (F008)
- `packages/sdk/src/actions/lend/core/LendProvider.ts:204-206` — `closePosition` asset guard to mirror (F008 reference)
- `packages/sdk/src/actions/lend/core/LendProvider.ts:234-257` — `validateMarketAllowed` allowlist-only, no blocklist (F010), empty-allowlist no-op (F081)
- `packages/sdk/src/actions/lend/core/LendProvider.ts:141-154` — `getMarkets` forwards caller `markets[]` (F102)
- `packages/sdk/src/actions/lend/utils/markets.ts:70-76` — `isMarketAsset` raw `===` on `undefined`, case-sensitive (F126)
- `packages/sdk/src/actions/lend/utils/markets.ts:50-60` — `validateMarketAsset` wrapper over `isMarketAsset` (F008/F126)
- `packages/sdk/src/actions/lend/utils/markets.ts:18-23` — `lendMarketIdMatches` case-insensitive reference pattern (F126)
- `packages/sdk/src/types/lend/base.ts:201` — `marketBlocklist` declared but unenforced (F010)
- `packages/sdk/src/actions/borrow/core/BorrowProvider.ts:215-236` — `getMarkets` forwards caller `markets[]` (F016)

## Acceptance criteria / tests

Each test must fail when the guard is reverted to current behavior (encode why the behavior matters, not just that it runs).

- `openPosition({ asset: WETH, marketId: <allowlisted USDC vault>, amount })` throws `MarketNotAllowedError` (asset mismatch) and never returns an `approval` on the wrong token; the matching-asset open still succeeds. Mirror the existing `closePosition` asset-mismatch test.
- `isMarketAsset`/`validateMarketAsset`: an asset whose `address` map has no entry for the market's `chainId` is rejected (closes the `undefined === undefined` hole); a checksummed-vs-lowercase representation of the correct asset is accepted (case-insensitive parity with `lendMarketIdMatches`).
- A market present in `marketBlocklist` is rejected on `openPosition`, `closePosition`, and `getMarket` with `MarketNotAllowedError`, even when it is also in `marketAllowlist`.
- With an empty/undefined `marketAllowlist`, `openPosition`/`closePosition` follow the documented chosen semantics (asserts the empty-allowlist case is no longer a silent allow-all on the signing path) and match the `getMarkets`/`getMarket` read-path behavior for the same config.
- `LendProvider.getMarkets({ markets: [nonAllowlistedConfig] })` does not surface the caller config (intersected with allowlist or field removed); same assertion for `BorrowProvider.getMarkets({ markets: [arbitraryConfig] })`.

The validators on this surface currently have thin coverage; add the asset-comparator and blocklist cases as unit tests on `markets.ts` and `LendProvider` so the open/close symmetry cannot silently regress.

## Notes

- This augments **#334**. The whole lend-surface allowlist/blocklist/asset-mismatch family (F008, F010, F081, F102, F126) and its borrow twin (F016) all carry candidate issue #334; this ticket is the consolidated method-contract-symmetry + list-enforcement work to land under that issue.
- The decimals-scaling hazard in the F008 family (`openPosition` scales `amount` by the caller's `asset` decimals rather than the market underlying's — ledger `refines:F008` at `LendProvider.ts:90`, and the close-path twin at `:205-218`) is the same asset-mismatch root but is a distinct mis-scaling concern; it is referenced here for context and can be addressed in the same #334 pass once the asset guard from step 1 rejects mismatched assets up front.
- The Aave/Morpho provider-level open/close native-vs-ERC20 leg asymmetry (`AaveLendProvider.ts:56-84,92-120`, `MorphoLendProvider.ts:48-84`, ledger `refines:F008`) is the provider-side echo of the same open/close gap; fixing the core `openPosition` asset guard removes the precondition for routing a mismatched asset into those legs.
- The backend lend controller has no server-side asset/market reconciliation and relies entirely on this SDK guard (ledger F281, `packages/demo/backend/src/controllers/lend.ts:61-118`, review-only). Once step 1 lands, the SDK is the enforcing layer; no backend refactor is requested here, only awareness that the demo depends on the SDK fix.
- The borrow pre-built-quote blocklist-bypass (ledger F261, `WalletBorrowNamespace.ts:220`) is the borrow analog of F010 on the pre-built-quote vector and is tracked separately; it shares the "blocklist declared but not enforced on every path" pattern but lives on the borrow signing path, not this lend ticket.

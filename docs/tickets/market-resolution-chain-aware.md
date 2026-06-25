# Make asset/market allow/block filters and matchers chain-aware

> **AUGMENT existing issue #493 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | core |
| **Surface** | `actions.ts` asset allow/block filter (chain-agnostic), `validation.ts` same-asset symbol compare, Morpho `findBestVaultForAsset` dead helper, Aave/Morpho `depositCollateral` `max` divergence, `lend/utils/markets.ts` `isMarketAsset` |
| **Resolves findings** | F069, F006, F012, F019, F126 |
| **Candidate existing issue** | #493 |
| **Blocked by** | (none) |

## Problem

Several allow/block filters and same-asset/same-market matchers on the SDK's read and routing surfaces compare token identity by **address-without-chain** or by **symbol**, not by `(address, chainId)`. On the OP stack the same address is reused across many L2s (WETH is `0x4200…0006` on every chain; predeploy- and factory-derived collisions are common), so a chain-flattened or symbol-keyed comparison conflates two distinct assets.

None of these is a fund-loss hole on its own: the visible failures are over-blocking (an intended-supported asset silently disappears from the supported set), over- and under-rejecting same-asset swaps (a same-symbol/different-address pair is wrongly rejected, a same-address/different-symbol no-op swap is wrongly allowed), and a no-op asset guard that passes `undefined === undefined`. But these are the identity checks the rest of the surface keys on before it resolves a market and builds calldata, and they currently disagree with the canonical `(address, chainId)` matchers (`lendMarketIdMatches`, `findMarketInAllowlist`) that already exist in the same packages. The fix is to make the divergent matchers use the same `(address, chainId)` key, and to align the one sibling-behavior divergence (Aave rejects `max` for `depositCollateral`, Morpho accepts it) so the public API answers the same call the same way.

## Findings

- **F069** (low, correctness) — `packages/sdk/src/actions.ts:204-208`: `getSupportedAssets` builds `blockedAddresses = new Set(block.flatMap(getAllAssetAddresses))` and filters `allow` by `addresses.some((addr) => blockedAddresses.has(addr))`. `getAllAssetAddresses` (`packages/sdk/src/utils/assets.ts:105-112`) flattens an asset's address map across **all** chains, lowercased, dropping `chainId`. Blocking asset X (whose chain-A address equals allowed asset Y's chain-B address) silently removes Y from the supported set on every chain. Over-blocking only — no fund loss, but it hides an intended-supported asset.
- **F006** (low, correctness) — `packages/sdk/src/utils/validation.ts:51-58`: `validateNotSameAsset` rejects only when `assetIn.metadata.symbol.toLowerCase() === assetOut.metadata.symbol.toLowerCase()`, never comparing resolved on-chain addresses; symbol is attacker-influenced metadata. The guard over-rejects same-symbol/different-address pairs and misses same-address/different-symbol no-op swaps. It is the sole same-asset guard on the swap path (`SwapProvider.ts:441`).
- **F012** (low, correctness) — `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:434-459`: `findBestVaultForAsset` filters the allowlist with `Object.values(vault.asset.address).includes(asset)` (`:447`), matching the asset address against the asset's map for **every** chain, then returns `assetVaults[0].address`; the not-found error hard-codes `chainId: 0` (`:452`). It is exported but has no callers (dead code) — a latent cross-chain mis-routing footgun if ever wired into a deposit flow.
- **F126** (low, correctness) — `packages/sdk/src/actions/lend/utils/markets.ts:70-76`: `isMarketAsset` returns `marketAssetAddress === providedAssetAddress`, where each side is `market.asset.address[chainId]` / `asset.address[chainId]`. If neither asset has an entry for `market.marketId.chainId`, both are `undefined` and `undefined === undefined` is `true`, so an asset not even configured on the market's chain passes the close-path guard (`validateMarketAsset` at `LendProvider.ts:206`). The compare is also case-sensitive, unlike the sibling `lendMarketIdMatches` (`:18-23`).
- **F019** (low, info) — `packages/sdk/src/actions/borrow/providers/aave/quote.ts:153-167`: `buildAaveDepositCollateralQuoteArgs` throws `InvalidParamsError` for `{ max: true }` on `depositCollateral` (`:160-166`), while Morpho's `_depositCollateral` resolves `max` to the wallet's full collateral-token balance (`MorphoBorrowProvider.ts:201-202`). The same public call answers differently across providers with no type-level signal — an API-consistency gap, not fund loss.

## Root cause

Identity comparison on these surfaces was written ad hoc per call site instead of routed through one `(address, chainId)` matcher. Two canonical matchers already exist in these same packages — `lendMarketIdMatches` / `findMarketInAllowlist` (`lend/utils/markets.ts:18-42`) compare `address.toLowerCase()` **and** `chainId` — but the divergent sites do not use them:

- the asset block filter (F069) and the dead Morpho helper (F012) flatten the per-chain address map and drop `chainId`;
- the same-asset swap guard (F006) keys on symbol, not address+chain;
- `isMarketAsset` (F126) compares per-chain addresses with raw `===` and does not reject `undefined`, so it both fails-open on off-chain assets and is case-sensitive against its own sibling.

Separately, the `depositCollateral` `max` contract (F019) was decided independently per provider, so two sibling providers expose different behavior for the same public method. All five are missing-obvious-validation / sibling-consistency gaps: the SDK already has the chain id and the canonical matcher in hand.

## Recommended approach

Make every divergent matcher compare `(address, chainId)`, reusing the existing canonical helpers rather than adding parallel ones. This is an SDK refactor (in scope) confined to comparator internals; no behavior change for correctly-configured single-chain callers.

1. **Asset block filter (F069), `actions.ts:204-208`.** Key the block set by `(chainId, address)` pairs and compare per chain instead of on a cross-chain-flattened lowercased set. Reuse a `marketId`-style composite key (e.g. iterate `asset.address` entries and build `chainId:address` keys) rather than `getAllAssetAddresses`, which intentionally flattens chains. Leave `getAllAssetAddresses` itself untouched unless no other caller needs the flattened form — confirm callers first (Rule 8). Coordinate with **#437** / `recipient-validation-symmetry`, which also lists F069: land the chain-aware filter in whichever ticket is implemented first and cross-reference, do not implement twice.
2. **Same-asset swap guard (F006), `validation.ts:51-58`.** Compare resolved on-chain addresses on the target chain (with native/wrapped normalization) via `isAddressEqual` when both assets resolve to an address on that chain; keep the symbol check as a fallback for assets that do not resolve. This aligns same-asset identity with the address-keyed rest of the swap surface. Also tracked under **#437** — same coordinate-once note as F069.
3. **`isMarketAsset` totality + casing (F126), `markets.ts:70-76`.** Reject when **either** resolved per-chain address is `undefined`, and compare case-insensitively (`isAddressEqual` or `.toLowerCase()`) to match `lendMarketIdMatches` (`:18-23`). This closes the `undefined === undefined` hole and the checksum divergence in one place. Already carried under **#334** / `lend-asset-market-validation` as the validator-internal hardening behind the F008 family — land it there; this ticket records it as the chain-aware-matcher view so #493 reviewers see the cross-cutting pattern.
4. **Dead Morpho helper (F012), `morpho/sdk.ts:434-459`.** Prefer **deleting** the unused export (no callers; lowest-risk, removes a latent footgun). If a future deposit-routing path is known to need it, instead make it chain-scoped: require a `chainId`, filter by `vault.asset.address[chainId]` (and `marketId.chainId`), validate the resolved address with `isAddress`, and propagate the real `chainId` in the not-found error instead of `0`. Default recommendation: delete, and remove the now-orphaned imports your deletion creates (Rule 3).
5. **`depositCollateral` `max` divergence (F019), `aave/quote.ts:160-166` vs `MorphoBorrowProvider.ts:201-202`.** Pick one contract and reflect it in the type. Lowest-risk alignment that preserves the documented Aave native-ETH-gateway limitation: keep Aave's rejection but make Morpho reject `max` for `depositCollateral` too (uniform `InvalidParamsError`), or — if product wants `max` supported — implement it on Aave's non-gateway ERC-20 path and document the native-ETH limitation. Either way, encode the decision at the type level so the divergence cannot silently reappear. This is a behavior choice on a public method, so confirm the intended contract with product before changing Morpho's accepted input.

No demo/CLI changes are in scope for this ticket; all five findings are SDK-core.

## Affected files

- `packages/sdk/src/actions.ts:204-208` — `getSupportedAssets` chain-agnostic block filter (F069)
- `packages/sdk/src/utils/assets.ts:105-112` — `getAllAssetAddresses` flattens chains, drops `chainId` (F069, root)
- `packages/sdk/src/utils/validation.ts:51-58` — `validateNotSameAsset` symbol-only compare (F006)
- `packages/sdk/src/actions/lend/utils/markets.ts:70-76` — `isMarketAsset` raw `===` on `undefined`, case-sensitive (F126)
- `packages/sdk/src/actions/lend/utils/markets.ts:18-42` — `lendMarketIdMatches` / `findMarketInAllowlist` canonical `(address, chainId)` reference (reuse target)
- `packages/sdk/src/actions/lend/providers/morpho/sdk.ts:434-459` — dead chain-agnostic `findBestVaultForAsset` (F012)
- `packages/sdk/src/actions/borrow/providers/aave/quote.ts:153-167` — Aave rejects `max` for `depositCollateral` (F019)
- `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts:201-202` — Morpho accepts `max` for `depositCollateral` (F019, sibling)

## Acceptance criteria / tests

- F069: a test where allowed asset Y (chain B) shares an address with blocked asset X (chain A) confirms Y remains in `getSupportedAssets()`; blocking X on chain A no longer removes Y on any chain.
- F006: `validateNotSameAsset` rejects a same-address/different-symbol pair on the target chain (no-op swap caught) and accepts a same-symbol/different-address pair (legit pair allowed); symbol fallback still rejects when neither side resolves to an address.
- F126: `isMarketAsset` returns `false` when either resolved per-chain address is `undefined` (off-chain asset rejected), and returns `true` for a checksummed-vs-lowercase address match (case-insensitive parity with `lendMarketIdMatches`).
- F012: either the export is deleted and a no-callers / no-dead-export assertion holds, or the chain-scoped version filters by `vault.asset.address[chainId]` and propagates the real `chainId` (covered by a test that a cross-chain address collision no longer matches).
- F019: `depositCollateral({ amount: { max: true } })` produces the **same** outcome (uniform reject, or uniform full-balance deposit) across Aave and Morpho markets; the chosen contract is encoded in the input type and a test pins it on both providers.
- Existing lend/borrow/swap allowlist, blocklist, and same-asset tests still pass (no regression for correctly-configured single-chain callers).

## Notes

- F069 and F006 also appear on **#437** (`recipient-validation-symmetry`) and F126 on **#334** (`lend-asset-market-validation`) because they share the "key identity on canonical `(address, chainId)`, not symbol/casing/flattened-set" root pattern. This ticket is the **chain-aware-matcher** consolidation under **#493**; coordinate implementation so each matcher is fixed once and cross-referenced, not duplicated across tickets.
- The two canonical matchers `lendMarketIdMatches` / `findMarketInAllowlist` already encode the correct `(address, chainId)` comparison — these are the reuse target, not a new abstraction (Rule 8, simplicity-first).
- Out of scope: RPC trust (integrators bring their own RPC — documented assumption), and any speculative intent-guessing. These fixes only tighten comparators the SDK already has the inputs to evaluate.
- F019 is the only item that changes a public method's accepted input on one provider; gate the Morpho-side change on product sign-off for the intended `max` contract.

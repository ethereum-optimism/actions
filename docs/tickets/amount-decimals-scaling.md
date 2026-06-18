# Scale lend/borrow amounts by market-underlying decimals, not caller-supplied asset decimals

> **AUGMENT existing issue #334 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | lend (with borrow sibling) |
| **Surface** | `LendProvider` open/close decimals scaling + `validateMarketAsset`, `MorphoBorrowProvider` constructor marketParams↔configured-asset bind, backend `resolveAsset` case-sensitivity |
| **Resolves findings** | F260, F285 |
| **Candidate existing issue** | #334 |
| **Blocked by** | lend-asset-market-validation |

## Problem

Every lend and borrow amount the SDK signs is a human number scaled into wei by `10^decimals`, where `decimals` is read from the *Asset object the caller/config supplies*, not from the *token the calldata actually approves and moves*. The SDK builds the approval/supply/repay calldata against a different address (the market's underlying token) than the one whose `metadata.decimals` it used to compute the amount. As long as nothing asserts those two are the same token, a config (or a caller on a path that does not check) can pair an 18-decimal asset's decimals with a 6-decimal underlying and sign `approve(..., 1e18)` / `supplyCollateral(1e18)` where `1e6` was intended — a 10^12 over-approval and over-transfer of real funds, with no on-chain recovery once signed.

This is fund-safety because the mis-scaling lands on the *signed* approval and deposit amounts: the wallet grants and moves 10^Δdecimals more of the underlying than the user asked for. It is the decimals analog of the address-binding family the SDK already enforces elsewhere (Aave reserve↔asset bind), and it is missing on the Morpho borrow path entirely and on the lend `openPosition` path partially. The backend `resolveAsset` finding (F285) is the same root shape one layer up — an address-identity check that does not normalize, so the asset selector is matched inconsistently across sibling controllers.

## Findings

- **F260** — `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts:79-88`: the constructor only runs `verifyMorphoMarketId(marketId, marketParams)` (marketId == keccak256 of the params). It never asserts `marketParams.collateralToken === collateralAsset.address[chainId]` or `marketParams.loanToken === borrowAsset.address[chainId]`, and Morpho's marketId/marketParams carry no chainId (Morpho Blue is at the same CREATE2 address on every chain). The amounts are scaled by `collateralAsset/borrowAsset.metadata.decimals` at `packages/sdk/src/actions/borrow/core/internalParams.ts:34,41,103,114,125`, while the approval/supply calldata targets `marketParams.collateralToken`/`loanToken` at `packages/sdk/src/actions/borrow/providers/morpho/blue.ts:143,159,172`. A config pairing WETH (18-dec) with a 6-dec (or other-chain) `marketParams.collateralToken` passes verification and over-approves/over-supplies by 10^12.
- **F285** — `packages/demo/backend/src/utils/assets.ts:15`: `resolveAsset` matches with strict `token.address[chainId] === tokenAddress` against EIP-55 checksum-cased config addresses (`config/assets.ts:6,18`), while the swap/lend controllers pass `tokenAddress` cast to `Address` with no normalization and the borrow/wallet `AddressSchema` (`helpers/schemas.ts:10-13`) lowercases. A supported token sent lowercase yields `Asset not found` → opaque 500. Fails closed (no fund loss), but two address-handling contracts coexist in one backend and the asset selector resolves inconsistently across sibling controllers.

## Root cause

The amount-scaling decimals and the calldata token are sourced independently and never reconciled:

- On the Morpho borrow path the `BorrowMarketConfig` carries two unbound halves: `collateralAsset`/`borrowAsset` (whose `metadata.decimals` scale every signed amount) and `marketParams.collateralToken`/`loanToken` (the addresses actually approved and supplied). `verifyMorphoMarketId` proves the marketId matches the params hash but says nothing about whether those params name the same tokens — on the same chain — as the configured assets.
- On the lend path `openPosition` (`LendProvider.ts:84-90`) scales by `params.asset.metadata.decimals` after only `validateMarketAllowed(marketId)`; it never calls `validateMarketAsset`, so the deposit asset is not reconciled against the market's asset at all. `closePosition` (`LendProvider.ts:205-218`) does call `validateMarketAsset` but only when `params.asset` is provided, and `validateMarketAsset`/`isMarketAsset` (`utils/markets.ts:50-76`) compares the asset *address* only (and via raw `===`, not `isAddressEqual`), never the decimals that actually scale the amount.
- On the backend, `resolveAsset` is the asset selector but uses byte-exact `===` against checksum-cased config while sibling controllers feed it un-normalized input — the same "identity check that does not normalize" pattern one layer up.

In every case the SDK already holds both the intended token and the scaling token; nothing binds them.

## Recommended approach

Bind amount-scaling to the market underlying everywhere a human amount is scaled into a signed wei value. All SDK changes sit inside the missing-obvious-validation / fail-closed-where-the-SDK-already-knows / sibling-consistency scope; the backend change is review-only.

1. **Morpho borrow constructor bind (F260, SDK):** in `MorphoBorrowProvider`'s constructor, alongside `verifyMorphoMarketId`, assert per allowlist entry that `marketParams.collateralToken` equals `getAssetAddress(collateralAsset, chainId)` and `marketParams.loanToken` equals `getAssetAddress(borrowAsset, chainId)`, case-insensitively via `isAddressEqual`, on the configured `chainId`. This proves the decimals that scale every signed amount belong to the token actually approved/supplied on the configured chain. Throw a config-time error (reuse `BorrowMarketParamsMismatchError` or a sibling) so a mis-paired market fails at construction, before any signing. This mirrors the Aave reserve↔asset bind (F103 framing) and closes the chainId gap the Morpho marketId leaves open.

2. **Lend `validateMarketAsset` on open + decimals-aware compare (F260 sibling, SDK):** call `validateMarketAsset(market, params.asset)` in `openPosition` (it currently runs only on `closePosition` and only when `asset` is supplied), and extend `validateMarketAsset`/`isMarketAsset` to (a) compare addresses with `isAddressEqual` instead of `===`, and (b) assert the provided asset's `metadata.decimals` equals the market asset's decimals. This makes the lend deposit/withdraw amount provably scaled by the market underlying's decimals on both paths.

3. **Backend `resolveAsset` normalization (F285, demo — review-only, no refactor):** make the asset selector case-insensitive by comparing through viem `getAddress()` (or lowercasing both sides) inside `resolveAsset`, and/or run the swap/lend controllers' `tokenAddress` through the same lowercasing `AddressSchema` the borrow/wallet controllers already use. Schema/util-only change; no architectural refactor of the backend. Low-risk consistency fix so a supported token resolves regardless of input casing.

This is a decimals/address consistency item, not health-factor or intent-guessing: the fix is to use the binds and equality helpers the SDK already has on the surfaces that currently skip them. No RPC-trust hardening and no refuse-to-sign behavior is introduced — a correctly-configured market with matching decimals continues to sign exactly as today.

## Affected files

- `packages/sdk/src/actions/borrow/providers/morpho/MorphoBorrowProvider.ts:79-88` — constructor verifies marketId only; add collateralToken/loanToken↔asset+chain bind (F260)
- `packages/sdk/src/actions/borrow/core/internalParams.ts:34,41,103,114,125` — amounts scaled by configured `collateralAsset`/`borrowAsset` decimals (the decimals that must be bound) (F260)
- `packages/sdk/src/actions/borrow/providers/morpho/blue.ts:143,159,172` — approval/supply/repay calldata targets `marketParams.collateralToken`/`loanToken` (the token that must match the scaling asset) (F260)
- `packages/sdk/src/actions/lend/core/LendProvider.ts:84-90` — `openPosition` scales by `params.asset` decimals with no `validateMarketAsset` (F260 sibling)
- `packages/sdk/src/actions/lend/core/LendProvider.ts:205-218` — `closePosition` validates asset only when supplied; address-only check (F260 sibling)
- `packages/sdk/src/actions/lend/utils/markets.ts:50-76` — `validateMarketAsset`/`isMarketAsset` compare address via raw `===`, never decimals (F260 sibling)
- `packages/demo/backend/src/utils/assets.ts:15` — `resolveAsset` strict `===` against checksum-cased config (F285, review-only)
- `packages/demo/backend/src/config/assets.ts:6,18` — EIP-55 checksum-cased config addresses the selector matches against (F285 context)
- `packages/demo/backend/src/helpers/schemas.ts:10-13` — borrow/wallet `AddressSchema` that already lowercases (the consistent contract to adopt) (F285)

## Acceptance criteria / tests

- **Morpho borrow config bind (F260):** a `MorphoBorrowProvider` constructed with `collateralAsset = WETH` (18-dec) but `marketParams.collateralToken` set to a 6-dec token's address (and `marketId = computeMorphoMarketId(marketParams)` so verifyMorphoMarketId passes) now throws at construction. Same for a `marketParams.collateralToken` that is the correct token but on a different chain than `chainId`. A correctly-paired market still constructs. Each test fails if the bind is removed.
- **Borrow over-approval regression (F260):** with the bind removed, `openPosition({ collateralAmount: 1 })` against the mis-decimals config would emit `approve(token6dec, 1e18)`; assert that this config can no longer be constructed, so the 10^12 over-approval is unreachable.
- **Lend open asset/decimals bind (F260 sibling):** `openPosition` with an `asset` whose address matches the market asset but whose `metadata.decimals` differs throws `MarketNotAllowedError` (or the decimals-mismatch error); `openPosition` with the correct asset still passes. `validateMarketAsset` rejects a same-address asset with mismatched decimals and accepts the matching one. Address comparison uses `isAddressEqual` (test a checksum-vs-lowercase pair that `===` would have rejected).
- **Backend resolveAsset case-insensitivity (F285):** `resolveAsset(lowercase(0xb1b0…dd839), chainId)` returns the asset instead of throwing `Asset not found`; a genuinely unsupported address still throws. Add a controller-level test that `POST /lend/position/open` (or `GET /swap/quote`) with a lowercased supported `tokenAddress` no longer 500s.

Each test encodes why the behavior matters (a signed amount mis-scaled by 10^Δdecimals moves the wrong quantity of funds; the selector must resolve a supported token regardless of casing), not merely that the guard runs.

## Notes

- This augments **#334**. F260 is the medium-severity SDK half (Morpho borrow marketParams↔asset+chain bind plus the lend open/close decimals symmetry); F285 is the low-severity backend selector consistency half. The borrow-blocklist-on-prebuilt-quote item (F261) that also references #334 is tracked separately; this ticket is specifically the decimals/identity-scaling vector.
- Distinct from F017 (Morpho marketId hash integrity / allowlist coverage) and from the lend-side asset-reconciliation family (F008): this is specifically about the *decimals* that scale signed amounts diverging from the approved/transferred token, not about marketId integrity or allowlist membership.
- Blocked by **lend-asset-market-validation**: the lend `validateMarketAsset`-on-open change shares the same `validateMarketAsset`/`isMarketAsset` surface, so the asset-market validation work should land first (or together) to avoid two passes over `utils/markets.ts`.
- The Morpho marketId deliberately omits chainId because Morpho Blue is deployed at the same CREATE2 address on every chain; the configured `chainId` is the only source of truth for which chain's token the decimals belong to, which is why the bind must be chain-pinned.
- F285 is demo backend and stays review-only: a schema/util-only normalization, no architectural refactor of the backend, consistent with the other demo/CLI tickets in this set.

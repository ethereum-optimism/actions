# Add a public-export-surface snapshot guard and fix the asymmetric exports

> **AUGMENT existing issue #483 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 2 (of 5) |
| **Domain** | core |
| **Surface** | `packages/sdk/src/index.ts` (root barrel re-exports), `packages/sdk/src/__tests__/index.exports.spec.ts` (the only export guard) |
| **Resolves findings** | F147, F125, F142, F128, F119, F124, F122, F140 |
| **Candidate existing issue** | #483 |
| **Blocked by** | (none) |

## Problem

The SDK's published value comes from a stable, importable surface: integrators `import { AaveLendProvider } from '@op/actions-sdk'`, `catch (e) { if (e instanceof SmartWalletDeploymentError) ... }`, and `instanceof`-narrow named error classes to decide whether a failure is a config/validation rejection they must block on or a transient blip they can retry. Two things break that contract today and nothing in CI catches either.

First, the guard is almost absent. `index.ts` re-exports roughly 141 symbols (asset constants, error classes, `Wallet`/`SmartWallet`, `serializeBigInt`, ENS helpers, provider classes, ~70 types), and `index.exports.spec.ts` pins exactly 4 of them (the two borrow providers and the two Morpho market-id helpers). Renaming or dropping any of the other ~137 - including a safety-bearing named error class or a validator a consumer keys their catch logic on - is a breaking semver change that ships with green CI. The two `export *` error wildcards compound it by letting the public taxonomy drift in either direction with no diff in `index.ts` for a reviewer to see (the wildcard-to-named cleanup itself is owned by the named-error-taxonomy ticket, F148; this ticket adds the guard that would catch its regression).

Second, several public symbols are already asymmetrically dropped from the root while their siblings are re-exported, so a root import resolves `undefined` with no compile error. `AaveLendProvider` is absent while `LendProvider`/`MorphoLendProvider` and the entire borrow provider pair are exported. `MorphoBorrowMarketConfig` is absent while `AaveBorrowMarketConfig` is exported. `SmartWalletDeploymentError` is the declared type of the public `createSmartWallet()` return yet is never exported. The hosted barrels are inconsistent per provider and per environment.

Fund-safety framing: nothing here moves value incorrectly, so this is not a signing-path exploit. It is a recoverability and consistency defect on the public surface. The specific hazard is that the symbols most worth pinning are the ones whose silent loss is most dangerous: a named error class or a validator a consumer relies on to fail closed. If a refactor renames `QuoteRecipientMismatchError` or `SmartWalletDeploymentError`, every downstream `instanceof` check silently stops matching, the consumer's fail-closed branch goes dead, and the error falls through to a generic retry path. The SDK already owns every one of these symbols; the fix is purely additive guarding plus fixing the obvious asymmetric drops.

## Findings

- **F147** (`__tests__/index.exports.spec.ts:1-27`, medium): the only export test pins 4 of ~141 root exports, so removing or renaming any of the other ~137 (asset constants, named errors, `Wallet`/`SmartWallet`, `serializeBigInt`) is an uncaught breaking change. Umbrella for the per-surface gaps below.
- **F125** (`index.ts:13`, medium): the root re-export line is `export { LendProvider, MorphoLendProvider }` - `AaveLendProvider` is dropped, though the lend barrel (`actions/lend/index.ts:2`) exports it and the borrow pair (`index.ts:3-6`) exports both siblings; `import { AaveLendProvider }` from the root resolves `undefined`.
- **F142** (`wallet/core/wallets/smart/error/errors.ts:5-18`, medium): `SmartWalletDeploymentError` is the declared type of `SmartWalletCreationResult.deployments[].error` (the public `createSmartWallet()` return) and the provider branches on `instanceof SmartWalletDeploymentError`, yet it is never exported from `index.ts`, so consumers cannot narrow it or recover the structured `chainId`/`receipt`.
- **F128** (`index.ts:92-93,134`, low): `AaveBorrowMarketConfig`/`AaveBorrowMarketParams` and the raw `MorphoMarketParams` struct are exported, but the narrowed `MorphoBorrowMarketConfig` (`types/borrow/market.ts:108-112`) is not, so a Morpho allowlist entry must be hand-rolled from the broad `BorrowMarketConfig` union.
- **F119** (`types/swap/base.ts:136-149`, low): `SwapPriceParams` is exported across the swap type chain yet a repo-wide grep finds zero references beyond its own definition - a dead public type with no backing method - and the overlapping `SwapPrice`/`SwapQuote` pair invites caller confusion about the real quote contract.
- **F124** (`__tests__/index.exports.spec.ts:16-26`, low): the export guard asserts only the borrow providers and Morpho helpers and never touches the lend surface, which is precisely why the F125 `AaveLendProvider` drop shipped undetected.
- **F122** (`actions/swap/index.ts:1-20`, low): no snapshot pins the swap export set; dropping a swap config-type export leaves the suite green. (The swap safety-default literals are already pinned by `SwapProvider.test.ts`, so only the export-set guard is missing here.)
- **F140** (`wallet/node/index.ts:1-8`, low): the hosted barrels are asymmetric - node exports the Privy classes but not the registered Turnkey classes, react exports only `DynamicWallet` and no provider class - with no stated rule and no guard test.

## Root cause

The export surface was curated by hand, one `export { ... }` line at a time, with no single test asserting the resulting set. Two consequences follow from the same gap. Hand-curation drifts: a sibling provider or a narrowed config variant gets added on one side of a pair and forgotten on the other (F125, F128, F140), and a public-return-type class never gets wired to the root at all (F142). And hand-curation has no regression net: the lone export test pins the handful of symbols whoever wrote it cared about (F124), so every other drop or rename is invisible to CI (F147, F122, F119). The `export *` wildcards are the same anti-pattern in the other direction - uncurated additions become public silently.

## Recommended approach

Two pieces, both additive and low-risk; no architectural refactor.

1. **Fix the asymmetric drops (the obvious, mechanical part).**
   - F125: add `AaveLendProvider` to the root lend re-export so the line reads `export { AaveLendProvider, LendProvider, MorphoLendProvider } from '@/actions/lend/index.js'`, matching the lend barrel and the borrow pair.
   - F142: export `SmartWalletDeploymentError` from `index.ts` alongside the other named-error modules (and the `SmartWalletCreationResult`/`SmartWalletDeployment` result types so consumers can name the full return shape). The base-class fix for this error (`extends ActionsError`) and the wildcard-to-named conversion are owned by the smart-wallet-deployment-error-taxonomy and named-error-taxonomy-signing-path tickets respectively; this ticket only closes the root-export gap and then pins it.
   - F128: add `MorphoBorrowMarketConfig` to the public `export type { ... }` block for symmetry with `AaveBorrowMarketConfig`.
   - F140: decide and document the intended hosted-export set, then make the node and react barrels symmetric (export the Turnkey provider/wallet classes in node; export the intended react classes). This is a small decision, not a refactor - keep it to the barrel re-export lines and do not touch the lazy-registry `import()` boundary (the eager-load coupling is its own item, #131).
   - F119: this is a judgment call to flag, not silently flip. `SwapPriceParams` has no producer or consumer. Prefer removing it (and `SwapPrice` if it is meant to be an internal provider shape) from the exported surface, since exporting a type nothing uses is bloat that later cannot change without a semver bump. If a price-only read API (`actions.swap.getPrice`) is actually intended, wire it instead. Surface both options; do not assume.

2. **Add the snapshot guard (the regression net, F147/F124/F122).** Add an export-surface guard over the root entrypoints (`index.node.ts` and `index.react.ts`) that asserts the sorted set of exported keys via `toMatchSnapshot` or an explicit allow-list, so any added, dropped, or renamed export forces a visible, reviewed diff. Generalize the existing `index.exports.spec.ts` (do not leave the borrow-only block as the only guard): a single snapshot over the whole set subsumes the per-surface lend (F124) and swap (F122) gaps. Keep the existing `.toBe(internalSymbol)` identity assertions for the safety-bearing classes that matter most (named errors, `SmartWalletDeploymentError`, the validators) so the guard catches a same-name-different-binding swap, not just a missing key.

The guard is the load-bearing deliverable: once it exists, the asymmetric drops above cannot silently recur, and the next refactor that renames a fail-closed error class fails CI instead of shipping.

## Affected files

- `packages/sdk/src/index.ts:13` - add `AaveLendProvider` to the lend re-export (F125).
- `packages/sdk/src/index.ts:92-93,134` - add `MorphoBorrowMarketConfig` to the public `export type` block (F128).
- `packages/sdk/src/index.ts` (named-error re-export region near :77,167) - add `SmartWalletDeploymentError` and the smart-wallet result types (F142).
- `packages/sdk/src/wallet/core/wallets/smart/error/errors.ts:5-18` - the class to export (F142).
- `packages/sdk/src/types/borrow/market.ts:108-112` - `MorphoBorrowMarketConfig` definition (F128).
- `packages/sdk/src/types/swap/base.ts:136-149` - `SwapPriceParams` (and the `SwapPrice`/`SwapQuote` overlap) to remove-or-wire (F119).
- `packages/sdk/src/wallet/node/index.ts:1-8` and `packages/sdk/src/wallet/react/index.ts` - make hosted barrels symmetric (F140).
- `packages/sdk/src/__tests__/index.exports.spec.ts:1-27` - generalize from the 4-symbol borrow block to a full-surface snapshot guard (F147, F124, F122).

## Acceptance criteria / tests

- `import { AaveLendProvider } from '@op/actions-sdk'` resolves to the class, not `undefined`; a test asserts the root `AaveLendProvider` is the same binding as the lend-barrel `AaveLendProvider`.
- `import { SmartWalletDeploymentError }` and `import type { MorphoBorrowMarketConfig }` from the root both resolve; a `createSmartWallet()`-failure test can `instanceof SmartWalletDeploymentError`-narrow `deployments[].error` and read typed `.chainId`/`.receipt`.
- A snapshot/allow-list test over `index.node.ts` and `index.react.ts` exported keys exists; deleting or renaming any export (e.g. renaming `serializeBigInt`) fails the test, and the snapshot diff is the review gate.
- The guard includes identity assertions (`.toBe(internalSymbol)`) for the named error classes, `SmartWalletDeploymentError`, and the validators, so a same-name-but-different-binding swap fails.
- The hosted barrels export the same conceptual class set per provider across node and react per the documented rule, and a hosted export-snapshot test pins both entrypoints (F140).
- `SwapPriceParams` is either removed from the exported surface or backed by a real method, per the decision recorded on the ticket; the guard reflects whichever lands (F119).
- Full `pnpm` typecheck, lint, test, and build pass.

## Notes

- This is the SDK-side of #483 and the umbrella for the per-surface export-guard gaps. The wildcard `export *` cleanup (F148) lives in `named-error-taxonomy-signing-path.md`; the `SmartWalletDeploymentError extends ActionsError` base-class fix (F143) lives in `smart-wallet-deployment-error-taxonomy.md`. This ticket deliberately does only the root-export wiring plus the guard so those two tickets stay focused, but the guard added here is what prevents either of their fixes from silently regressing.
- Scope discipline: all changes are additive re-exports plus a test. No signing-path behavior changes, no refusal logic, no RPC-trust assumptions. The one symbol-removal candidate (`SwapPriceParams`, F119) is a dead public type with zero references, so removing it changes no runtime behavior, only the published surface.
- F140's "make the barrels symmetric" requires a small product/DX decision about which hosted classes are intended to be public. Record that decision on #483 before wiring, since it determines the snapshot baseline.

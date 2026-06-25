# Replace bare Error throws on signing paths with the ActionsError taxonomy

> **AUGMENT existing issue #474 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 3 / 5 |
| **Domain** | core |
| **Surface** | lend/borrow/swap providers, `DefaultSmartWallet` hot path, ENS errors, wildcard `export *` |
| **Resolves findings** | F011, F121, F130, F139, F150, F148 |
| **Candidate existing issue** | #474 |
| **Blocked by** | (none) |

## Problem

The SDK documents (`core/error/errors.ts:3-8`) that every SDK error extends `ActionsError` (a viem `BaseError` subclass) so integrators can `catch (e) { if (e instanceof ActionsError) ... }`, narrow by class, and read structured fields. That contract is the SDK's only machine-readable way for a caller to tell a **validation/config rejection it must block signing on** apart from a **transient RPC/bundler blip it can retry**. Multiple signing-path sites break the contract two ways:

1. **Bare `Error` throws** that are not `instanceof ActionsError`, carry no structured metadata, and (in the catch-all cases) drop the precise inner cause. A `MarketNotAllowedError` or asset-mismatch raised inside an Aave/Morpho `_openPosition`/`_closePosition` try block surfaces to the caller as the opaque string `Failed to close position` with no `{ cause }` — so an integrator's `ActionsError`-typed handler cannot distinguish "this market is not allowed, halt" from "RPC hiccuped, retry." On a fund-moving path, losing that discriminator means a genuine validation failure can be silently treated as retryable noise.

2. **Two wildcard `export *` re-exports** of the error modules (`index.ts:77,167`) make the public error taxonomy uncurated: any symbol added to those modules silently becomes public and semver-locked, and a rename/removal is a breaking change with no diff in `index.ts` for a reviewer to catch. The ENS errors compound this — they are publicly exported but extend bare `Error`, so they ship outside the very `instanceof ActionsError` discriminator the docs promise, on the recipient-resolution path that produces signed addresses.

This is not a refuse-to-sign or intent-guessing change. It is a consistency/fail-closed-where-the-SDK-already-knows cleanup: the SDK already has a named taxonomy and a documented catch contract; a handful of sites do not route through it, and the public error surface is not curated.

## Findings

- **F011** (low, correctness) — `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:79-83,117-118,206-208` (Morpho twin `MorphoLendProvider.ts:80-83,130,214-216`, base `LendProvider.buildLendApproval` `:282`): catch-alls in provider open/close/getPosition flatten precise named errors into bare `Error` strings (e.g. `Failed to open position with ${amountWei} of ${asset.metadata.symbol}`) with no `{ cause }`, masking `MarketNotAllowedError`/`ChainNotSupportedError`/asset-mismatch reverts on the signing path. The interpolated `asset.metadata.symbol` is also unvalidated free text (the log-injection lens of the same family).
- **F121** (low, info) — `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:101,203`: the Velodrome v2 router-type switch throws `throw new Error(\`Unknown router type: ${routerType as string}\`)` at the two only non-`ActionsError` throw sites in the entire swap surface; the `as string` cast hints the `routerType` discriminant is not exhaustively typed.
- **F130** (low, info) — `packages/sdk/src/actions/borrow/core/BorrowProvider.ts:277-286`: `requireOwnMarket` throws a bare `Error` (`${this.constructor.name} received a ${market.kind} market config`), the single borrow throw outside the named taxonomy every other borrow path uses; a wrong-kind market reaching a provider is uncatchable-by-class.
- **F139** (low, info) — `packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:22`: the only thrown error in the wallet-hosted surface is `throw new Error('Wallet not connected or not EVM compatible')`; no `WalletNotConnectedError`/`UnsupportedWalletError` exists, so the caller gets a plain `Error` whose `.name` is `'Error'`, indistinguishable from a transport failure.
- **F150** (low, correctness) — `packages/sdk/src/services/nameservices/ens/errors.ts:7,24,37`: `EnsNotConfiguredError`/`EnsResolutionError`/`EnsRpcError` (exported from `index.ts:81-83`) extend bare `Error` and hand-set `.name`, so an `instanceof ActionsError` handler silently misses every ENS failure on the recipient-resolution path that produces signed addresses.
- **F148** (low, infra) — `packages/sdk/src/index.ts:77,167`: two wildcard `export *` re-exports of `@/core/error/errors.js` and `@/wallet/core/error/errors.js` splat whole modules into the public surface; by contrast the ENS module is re-exported by explicit name (`index.ts:78-90`). Combined with the absent export-surface snapshot (F147/#483), the error taxonomy can drift in either direction undetected.

## Root cause

The named-error taxonomy was applied unevenly. Most of core/wallet/swap-named/lend-named/borrow-named throws through `ActionsError` subclasses, but a handful of sites predate or sit outside that convention: provider catch-alls rewrap-and-flatten instead of rethrowing the named cause, the `DefaultSmartWallet.send`/`sendBatch` hot path collapses the class **and** the `cause` into `Failed to send transaction: ${message}`, the Velodrome router switch and borrow `requireOwnMarket` and Dynamic `createSigner` are one-off bare `Error` invariants, and the ENS errors were authored against `Error` rather than `ActionsError`. Separately, the public error surface is exported by wildcard rather than curated by name, so there is no review gate keeping the taxonomy consistent or preventing drift. Every leg here is "the SDK already has a named error / a documented catch contract; this site does not use it" — a consistency and fail-closed-discriminator gap, not new behavior.

## Recommended approach

All changes are within the SDK (SDK refactor allowed). The goal is one uniform, `instanceof ActionsError`-narrowable taxonomy on the signing paths plus a curated error export surface. No new refuse-to-sign behavior — these are type/wrapping changes that preserve the same throw conditions, just with a catchable class and a preserved cause.

1. **Lend provider catch-alls (F011).** Narrow the `try/catch` in `AaveLendProvider`/`MorphoLendProvider` `_openPosition`/`_closePosition`/`_getPosition` and `LendProvider.buildLendApproval` so named errors (`MarketNotAllowedError`, `ChainNotSupportedError`, asset-mismatch) propagate unchanged. Where a wrap is genuinely needed, throw an `ActionsError` subclass constructed with `{ cause: error }` and drop the interpolated `asset.metadata.symbol`/`amountWei` free text from the top-level message (carry them as structured fields, not concatenated strings). This recovers the precise inner error that currently collapses into `Failed to {open,close} position`.

2. **Smart-wallet hot path (F011 core-services leg).** Replace the `DefaultSmartWallet.send`/`sendBatch` flatten (`:244-248,288-292`) and the invariant getters (`address` `:91`, `ensureLocalAccountSigner` `:164`, `addSigner` else `:347`) with named errors: a `SmartWalletSendError extends ActionsError` constructed `{ cause: error }` for the dispatch flatten (keeping the raw bundler/paymaster message out of the top-level `shortMessage`), and `InvalidParamsError`/an "not initialized" named error for the invariant getters. Preserving `cause` is what lets a caller tell a retryable bundler outage from a permanent paymaster/signature rejection.

3. **Velodrome router switch (F121).** Replace both bare throws with a named error (a new `UnsupportedRouterTypeError extends ActionsError` carrying `routerType`/`chainId`, or reuse `ProviderNotConfiguredError`), and tighten `routerType` to a closed union with an exhaustive `never` check so the unreachable branch is statically enforced.

4. **Borrow `requireOwnMarket` (F130).** Throw a named error — a new `MarketKindMismatchError`, or reuse `InvalidParamsError({ param: 'market.kind', expected: this.marketKind, received: market.kind })` — so the borrow surface taxonomy is fully uniform and a wrong-kind routing fault is catchable by class.

5. **Dynamic `createSigner` (F139).** Add a named error to `wallet/core/error/errors.ts` (`UnsupportedWalletError`/`SignerCreationError`) and throw it from the Dynamic `createSigner`; add a `@throws` note to the abstract `HostedWalletProvider.createSigner` JSDoc so sibling providers have a documented contract.

6. **ENS errors (F150).** Make `EnsNotConfiguredError`/`EnsResolutionError`/`EnsRpcError` extend `ActionsError`, moving `input`/`chainId` to typed fields and the human text to `super(shortMessage, { metaMessages })`, preserving `cause` via `ErrorOptions`. This restores the documented `instanceof ActionsError` discriminator on the recipient-resolution path.

7. **Curate the error exports (F148).** Replace the two `export *` error wildcards (`index.ts:77,167`) with explicit named re-exports listing exactly the public error classes, mirroring the ENS module's by-name re-export (`index.ts:78-90`). This gives the taxonomy a review gate so a new internal helper does not silently become public API and a removed class shows as a diff.

8. **Guard tests.** Add an assertion that every publicly-exported `*Error` is `instanceof ActionsError` (catches F150 and any future drift), and per-site `instanceof` tests for the newly-named throws (F121/F130/F139). The export-set snapshot itself is tracked under F147/#483 (export-surface guard ticket) — this ticket's test obligation is the `instanceof ActionsError` assertion and the per-site class checks, and it pairs with that snapshot work.

Note: the ticket scope references a `mapSdkError` helper; no such symbol exists in the SDK today (the SDK exposes the `ActionsError` base class and per-class subclasses, and integrators discriminate via `instanceof ActionsError`). The work here is to make every signing-path throw route through that existing taxonomy, not to introduce a new mapper. If a single `mapSdkError`/classifier helper is desired as part of #474, that is an additive convenience on top of the taxonomy and can be decided during implementation; it is not required to close these findings.

This stays inside the missing-obvious-consistency / fail-closed-discriminator / sibling-parity scope. No RPC-trust hardening (integrators bring their own RPC), no speculative intent-guessing, no broad refuse-to-sign: every change replaces a bare `Error` (or wildcard export) with the named `ActionsError` taxonomy the rest of the surface already uses, preserving the same throw conditions and the dropped `cause`.

## Affected files

- `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:79-83,117-118,206-208` — open/close/getPosition catch-alls flatten named errors, drop cause, interpolate `asset.metadata.symbol` (F011)
- `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:80-83,130,214-216` — Morpho twin of the lend catch-all flatten (F011)
- `packages/sdk/src/actions/lend/core/LendProvider.ts:282` — base `buildLendApproval` bare `Error` (F011)
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:91,164,244-248,288-292,347` — invariant getters + `send`/`sendBatch` flatten that drops class and cause (F011 core-services leg)
- `packages/sdk/src/actions/swap/providers/velodrome/encoding/routers/v2.ts:101,203` — bare `Unknown router type` throws, only non-`ActionsError` swap throws (F121)
- `packages/sdk/src/actions/borrow/core/BorrowProvider.ts:277-286` — `requireOwnMarket` bare `Error` (F130)
- `packages/sdk/src/wallet/react/wallets/hosted/dynamic/utils/createSigner.ts:22` — bare `Wallet not connected or not EVM compatible` (F139)
- `packages/sdk/src/wallet/core/error/errors.ts` — destination for a new `UnsupportedWalletError`/`SignerCreationError` (F139) and `SmartWalletSendError` (F011)
- `packages/sdk/src/services/nameservices/ens/errors.ts:7,24,37` — three ENS errors extend bare `Error` (F150)
- `packages/sdk/src/index.ts:77,167` — two wildcard `export *` error re-exports (F148); `:78-90` is the by-name ENS re-export to mirror
- `packages/sdk/src/core/error/errors.ts:8` — `ActionsError` base class the named errors extend (reference)

## Acceptance criteria / tests

Each test must fail when the change is reverted to the bare-`Error` behavior (encode why the discriminator matters, not just that a throw happens).

- A lend open/close where the resolved market is not allowed throws a `MarketNotAllowedError` (an `ActionsError`), not a generic `Failed to {open,close} position` string, and the thrown error's `cause` is the precise inner error. Assert `e instanceof ActionsError` and that the masked named class is recoverable. Same assertion for the Morpho provider.
- `DefaultSmartWallet.send`/`sendBatch` failure throws an `ActionsError` subclass with `{ cause }` set to the original bundler/paymaster error, and the raw external message is not the top-level `shortMessage`. Assert a paymaster-rejection vs a transient bundler error are distinguishable (by class or by inspecting `cause`).
- Routing a wrong-kind market into a borrow provider throws an `ActionsError` (`MarketKindMismatchError`/`InvalidParamsError`), assert `instanceof ActionsError`.
- Passing a non-EVM Dynamic wallet to the hosted `createSigner` throws the named `UnsupportedWalletError`/`SignerCreationError`, assert `instanceof ActionsError` (or the documented wallet-error base).
- An unrecognized Velodrome `routerType` throws the named error carrying `routerType`, assert `instanceof ActionsError`; the closed-union `never` check fails compilation if a router type is added without a branch.
- A failed ENS resolution on the swap recipient path throws an error that is `instanceof ActionsError` (closes F150); a generic assertion iterates every exported `*Error` symbol and asserts `instanceof ActionsError`.
- The public error exports are explicit named re-exports: removing or renaming a public error class produces a diff in `index.ts` (no wildcard), and the export-surface snapshot (F147/#483) flags add/remove/rename.

## Notes

- This augments **#474** (the named-error taxonomy issue). All six findings carry candidate issue #474 and were filed across review passes 01–07 as the consolidated "SDK side of #474" bare-Error family. This ticket is the curated list of the concrete loci to retrofit under that issue.
- The lend catch-all flatten (F011) also has an appsec lens in the ledger (`refines:F011`, review-pass-05): `asset.metadata.symbol` and `walletAddress`/`marketId.address` are interpolated verbatim into thrown strings, an output-spoofing/log-injection sink. Dropping the free-text interpolation in step 1 closes that lens at the same time; no separate ticket needed.
- The `DefaultSmartWallet` `send`/`sendBatch`/`deploy` catch blocks (review-pass-05 `refines:F011`) interpolate an unredacted bundler/paymaster `error.message` that can echo full signed `callData`/`initCode` bytes; step 2's "keep the raw external message out of the top-level message, carry it as `cause`" addresses the information-exposure footgun alongside the class/cause preservation.
- The export-surface **snapshot** guard (F147, `index.exports.spec.ts`, candidate #483) is a sibling ticket; F148 here is specifically the wildcard-to-named curation. The two should land together: the `instanceof ActionsError` assertion test belongs with whichever lands first, and the snapshot pins the curated set F148 produces.
- No demo/CLI changes are requested here. The CLI's own error rendering (`packages/cli/src/output/errors.ts`) is covered by separate review-only CLI findings (redactor family, F328/F338/F341) and is out of scope for this SDK taxonomy ticket.

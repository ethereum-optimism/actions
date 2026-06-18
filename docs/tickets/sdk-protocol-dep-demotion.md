# Demote ethers@5/@aave/@morpho ABI deps off the runtime signing graph

> **AUGMENT existing issue #255 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | infra |
| **Surface** | lend Aave read path (`aave/sdk.ts`: ethers@5 + `@aave/contract-helpers` + `@aave/math-utils`, display-only); Morpho borrow ABI constants (`blue-sdk-viem`: `blueAbi`/`blueOracleAbi`/`adaptiveCurveIrmAbi`); swap/lend/borrow eager protocol-SDK imports through the root barrel; `@morpho-org/morpho-ts` zero-import dep; `@morpho-org/blue-sdk` public-type leak |
| **Resolves findings** | F156, F157, F152, F158, F163, F164, F161, F173, F174 |
| **Candidate existing issue** | #255 |
| **Blocked by** | `sdk-dependency-pinning-and-optionality` |

## Problem

Every consumer of `@eth-optimism/actions-sdk` installs and statically links a full protocol-SDK closure — ethers@5, `@aave/contract-helpers`, `@aave/math-utils`, and the `@morpho-org/*` tree — regardless of which action they use. Tracing the actual runtime imports shows this closure does almost nothing on the signing path:

- **ethers@5 + `@aave/*` are display-only.** The single SDK-wide runtime import site for all three is `aave/sdk.ts`, which uses them to fetch a reserve snapshot for the informational `LendMarket.apy`. The Aave signing path builds calldata with viem against a local `POOL_ABI`/`WETH_GATEWAY_ABI` and never touches them.
- **`@morpho-org/blue-sdk-viem` is used only for static ABI constants** on the borrow path — three constant ABI arrays handed to viem. The sibling Aave borrow provider already vendors its ABIs and runs viem-only, so the codebase's own preferred pattern is established.
- **`@morpho-org/morpho-ts` is declared but never imported** by shipped code (only a test mock references it).

The fund-safety framing is supply-chain surface, not a calldata bug. ethers@5 pulls an **unpatched** `elliptic 6.6.1` ECDSA advisory (GHSA-848j-6mx2-7j84, no fix available) into the shipped runtime tree for a read-only RPC call viem can do, and it forces two ethers majors (5.8.0 and 6.16.0) to coexist, doubling the crypto surface a downstream integrator audits. A swap-only or Morpho-only integrator who never executes any Aave read still ships the whole ethers@5/`@aave/*` subtree and inherits its CVE exposure. The SDK already knows none of this code runs for those consumers; the fix is to vendor the ABI constants and demote the read-path SDKs to dev-only so the runtime closure matches what the signing path actually imports.

This is the protocol-SDK sibling of the F149/#131 hosted-wallet peer work: same eager-static-barrel root cause, a different (non-optional, non-peer) dependency class.

## Findings

- **F156** (medium, infra) — `packages/sdk/src/actions/lend/providers/aave/sdk.ts:1-3,118,121,151`: ethers (`providers.JsonRpcProvider`, line 3+118), `@aave/contract-helpers` (`UiPoolDataProvider`, line 1+121), and `@aave/math-utils` (`formatReserves`, line 2+151) are runtime `dependencies` consumed only by `getReserve`/`getReserves` for `LendMarket` display; the Aave signing path (`AaveLendProvider.ts:229,264,314,359`) uses viem against local ABIs and imports none of them.
- **F157** (medium, infra) — `packages/sdk/src/actions/lend/module.ts:1` → `lend/index.ts:2` → `lend/providers/aave/AaveLendProvider.ts:28` → `sdk.ts:1-3`: an unbroken static value-import chain pulls ethers@5/`@aave/*` into the module graph; the `if(config.aave)` guard gates provider *construction*, not module *evaluation*, so Morpho-only integrators still load the Aave subtree.
- **F152** (medium, infra) — `packages/sdk/package.json` (deps) + `packages/sdk/src/index.ts:8,13`: swap's only third-party runtime import is viem, yet the root barrel statically re-exports `computeAaveBorrowMarketId` (`:8`) and `MorphoLendProvider` (`:13`), and there is no per-action subpath export, so a swap-only consumer static-links the entire Aave/Morpho/ethers closure.
- **F158** (medium, infra) — `packages/sdk/src/actions/lend/providers/aave/sdk.ts:3,118` + `pnpm-lock.yaml:10238`: unpatched `elliptic 6.6.1` (GHSA-848j-6mx2-7j84, no fix) resolves under `@ethersproject/signing-key 5.8.0` inside `ethers 5.8.0`, riding into the lend runtime via the Aave read path. Demoting ethers@5 (F156) removes it from the shipped tree.
- **F163** (low, info) — `packages/sdk/src/actions/borrow/providers/morpho/blue.ts:2,73,91,109,124` (and `state.ts:3-6,65,71,77,83`): `@morpho-org/blue-sdk-viem` contributes only `blueAbi`/`blueOracleAbi`/`adaptiveCurveIrmAbi` static ABI constants, vendorable like the Aave borrow provider's `POOL_ABI`. `@morpho-org/blue-sdk` (AccrualPosition/Market/MarketUtils math) is **not** demotable — keep it runtime.
- **F164** (low, info) — `packages/sdk/src/actions/borrow/providers/aave/calldata.ts:1-8` (whole-provider graph): the Aave borrow provider is viem-only and imports zero `@aave/*` or ethers; those three are pulled solely by the lend Aave read path, so they are dead weight for borrow-only consumers (per-surface demotion evidence).
- **F161** (low, info) — `pnpm-lock.yaml:5004,5007,13498,13540`: two ethers majors resolve — `5.8.0` (the Aave read path) and `6.16.0` (pulled by `@turnkey/core`) — doubling the ethers crypto surface; demoting ethers@5 (F156) converges the tree on one major.
- **F173** (low, info) — `packages/sdk/package.json:64`: `@morpho-org/morpho-ts ^2.4.1` is a direct runtime dependency with zero source imports (only a `vi.mock` stub in `MorphoLendProvider.test.ts:25`); it is already a `blue-sdk` transitive, so the direct entry is pure first-order supply-chain bloat the published manifest misrepresents.
- **F174** (low, info) — `packages/sdk/src/types/lend/morpho.ts:6-17`: `AccrualVault`/`IAccrualVault`/`IVault`/`Vault`/`IVaultMarketAllocation`/`VaultMarketAllocation` are re-exported from `@morpho-org/blue-sdk` into the public `.d.ts` via the `index.ts:156` → `types/index` → `types/lend/morpho.ts` `export *` chain, making `@morpho-org/blue-sdk` a non-demotable hard type-resolution dep every consumer (including swap-only/EOA-only) must install to typecheck.

## Root cause

One eager-static-barrel pathology plus a runtime-vs-dev misclassification:

- **Misclassification (F156, F158, F161, F163, F173).** ethers@5 and `@aave/*` are declared in `dependencies` even though their only runtime use is a display-only reserve read; `blue-sdk-viem` is a runtime dep for what are constant ABI arrays; `morpho-ts` is declared but unused. The manifest describes a runtime closure larger than the signing path actually imports, dragging an unpatched `elliptic` advisory and a duplicate ethers major along with it.
- **Eager static barrel (F152, F157, F164).** There is no dynamic `import()` boundary around any heavy protocol provider and no per-action subpath export; the root barrel value-re-exports the Morpho and Aave providers, so importing the SDK at all evaluates the whole protocol tree. The `if(config.*)` guards gate construction, not module evaluation.
- **Public-API coupling (F174).** The lend types re-export `blue-sdk`'s internal interface names through the package root, so `@morpho-org/blue-sdk` is pinned into the public type contract and cannot be fully demoted without an SDK-owned type shim.

## Recommended approach

All changes are within the SDK (SDK refactor allowed). Order the work so the ABI/dep demotions land first and the public-type shim (F174) precedes any attempt to make `blue-sdk` internal-only.

1. **Vendor the Morpho borrow ABIs (F163).** Copy `blueAbi`, `blueOracleAbi`, `adaptiveCurveIrmAbi` into a shared `actions/shared/morpho/abis` module mirroring `actions/shared/aave/abis/pool.ts`, repoint `blue.ts`/`state.ts` at the vendored constants, and demote `@morpho-org/blue-sdk-viem` to a `devDependency` whose only job is a test asserting the vendored ABIs match upstream. Keep `@morpho-org/blue-sdk` (the marketId/accrual math) in runtime `dependencies`.

2. **Demote the Aave read-path SDKs (F156, F158, F161, F164).** Reimplement `getReserve`/`getReserves` on viem (`readContract` against `UiPoolDataProvider`/aToken, replacing the ethers `JsonRpcProvider`), then move `ethers`, `@aave/contract-helpers`, and `@aave/math-utils` to `devDependencies` and keep them only as a fork-test differential oracle that asserts the viem read matches the `@aave/*` reference. This removes the unpatched `elliptic 6.6.1` from the runtime tree (F158) and converges the codebase on one ethers major (F161). If a full viem reimplementation is out of scope for a first pass, the fallback is to hide the entire Aave read behind a dynamic `import()` so the ethers@5/`@aave/*` graph loads only when an Aave read actually runs.

3. **Break the eager barrel for protocol providers (F152, F157).** Lazy-load `AaveLendProvider`'s `sdk.ts` behind a dynamic `import()` gated by `if(config.aave)`, and/or split the heavy read code into a lazily-imported submodule, so Morpho-only and swap-only consumers do not evaluate the Aave/ethers subtree. Coordinate per-action subpath exports with the blocker ticket so a swap-only consumer can import without the protocol closure. (The barrel-level subpath/optionality mechanics are owned by `sdk-dependency-pinning-and-optionality`; this ticket lands the provider-side lazy boundaries.)

4. **Remove the unused dep (F173).** Drop `@morpho-org/morpho-ts` from `dependencies`; rely on the `blue-sdk` transitive, and if the test mock needs it, add it to `devDependencies` only. Add a depcheck/knip CI guard to catch declared-but-unused direct deps going forward.

5. **Shim the public Morpho vault types (F174).** Replace the raw `export *` of `blue-sdk` interface names in `types/lend/morpho.ts` with SDK-owned narrow public types (e.g. a `MorphoVaultInfo` shape) for the lend return surface, so `@morpho-org/blue-sdk` becomes an internal-only dependency and consumers no longer need it installed to typecheck non-Morpho usage. Note this is the one change with a public-API surface; sequence it as its own reviewable step.

Scope guard: the `elliptic` CVE reconciliation and the pnpm-audit-vs-Wiz count delta (F158) are tracking/info items for #432 and #432's owner, not work to perform here. The borrow-side caret-range pinning of `blue-sdk`/`blue-sdk-viem` on the signing path (F159/F162) belongs to the `sdk-dependency-pinning-and-optionality` blocker, not this demotion ticket.

## Affected files

- `packages/sdk/package.json:59-67` — move `@aave/contract-helpers`, `@aave/math-utils`, `ethers`, `@morpho-org/blue-sdk-viem` to `devDependencies`; remove `@morpho-org/morpho-ts`; keep `@morpho-org/blue-sdk`, `viem`, `permissionless` runtime.
- `packages/sdk/package.json:64` — remove the unused `@morpho-org/morpho-ts` direct dependency (F173).
- `packages/sdk/src/actions/lend/providers/aave/sdk.ts:1-3,118,121,151` — drop ethers/`@aave/*` value imports; reimplement `getReserve`/`getReserves` on viem (F156).
- `packages/sdk/src/actions/lend/module.ts:1`, `packages/sdk/src/actions/lend/index.ts:2`, `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:28` — introduce the dynamic-import boundary for the Aave read path (F157).
- `packages/sdk/src/index.ts:8,13` — coordinate per-action subpath / barrel changes with the blocker ticket so swap-only imports do not pull the protocol closure (F152).
- `packages/sdk/src/actions/borrow/providers/morpho/blue.ts:2,73,91,109,124` and `packages/sdk/src/actions/borrow/providers/morpho/state.ts:3-6,65,71,77,83` — repoint at vendored ABIs (F163).
- `packages/sdk/src/actions/shared/morpho/abis/` (new) — vendored `blueAbi`/`blueOracleAbi`/`adaptiveCurveIrmAbi`, mirroring `packages/sdk/src/actions/shared/aave/abis/pool.ts` (F163).
- `packages/sdk/src/types/lend/morpho.ts:6-17` — replace `blue-sdk` `export *` with SDK-owned public types (F174).
- `pnpm-lock.yaml:10238` (elliptic under signing-key), `pnpm-lock.yaml:5004,5007,13498,13540` (dual ethers majors) — expected to converge after the demotion (F158, F161).

## Acceptance criteria / tests

- **Manifest reflects real runtime needs.** `packages/sdk/package.json` runtime `dependencies` no longer lists `ethers`, `@aave/contract-helpers`, `@aave/math-utils`, `@morpho-org/blue-sdk-viem`, or `@morpho-org/morpho-ts`; `@morpho-org/blue-sdk`, `viem`, `permissionless` remain. A depcheck/knip CI step fails on any declared-but-unused direct dependency.
- **Runtime closure is ethers-free and single-major.** `pnpm why ethers` (or equivalent lockfile trace) shows no ethers under any `packages/sdk` runtime path; only `ethers 6.x` remains via `@turnkey/core` (F161). A prod-scoped advisory check shows `elliptic 6.6.1` no longer on the SDK runtime path (F158).
- **Vendored ABIs verified against upstream.** A dev-only test asserts the vendored `blueAbi`/`blueOracleAbi`/`adaptiveCurveIrmAbi` are byte-equal to `@morpho-org/blue-sdk-viem`'s exports (fork/differential oracle); a parallel dev-only test asserts the viem `getReserve` matches the `@aave/*` reference output for representative reserves (F156, F163).
- **Lazy boundary holds.** A module-graph closure test (extending #131's intent) imports only the swap action and the Morpho-only lend path and asserts neither evaluates `aave/sdk.ts` / the ethers/`@aave/*` subtree (F152, F157, F164).
- **Public typecheck no longer requires blue-sdk for non-Morpho consumers.** A typecheck of a swap-only / EOA-only consumer fixture passes without `@morpho-org/blue-sdk` installed (F174).
- **Signing path unchanged.** Existing Aave and Morpho calldata-encoding tests pass byte-for-byte; this ticket touches the read/display and dependency graph only, not the bytes a user signs.

## Notes

- This augments **#255**. Add the color here to that issue and flag it as important to work during implementation; do not open a new ticket.
- `@morpho-org/blue-sdk` stays a runtime dependency — its marketId derivation and accrual math sit on the signing/health path and are not demotable. Only `blue-sdk-viem` (ABI constants) and `morpho-ts` (unused) are demoted/removed.
- F158 and F161 are tracking/info findings: the durable fix is the ethers@5 demotion in step 2; the `pnpm audit` vs Wiz #432 count reconciliation is #432's, not this ticket's.
- The barrel-level subpath exports, peer optionality, and caret-range pinning are owned by the `sdk-dependency-pinning-and-optionality` blocker. This ticket lands the vendoring, the dev-only demotions, the unused-dep removal, the provider-side lazy boundaries, and the public-type shim; it depends on that ticket only for the consumer-facing subpath/export surface.
- The end-to-end Anvil feature test is a separate consolidated ticket; the differential-oracle tests here run against a fork/reference, not live signing.

# Pin signing-path dep ranges and make vendor SDKs optional/lazy

> **AUGMENT existing issue #131 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
| --- | --- |
| **Severity** | medium |
| **Complexity** | 4 / 5 |
| **Domain** | infra |
| **Surface** | `packages/sdk/package.json` peerDependencies/dependencies; node/react wallet barrels eager re-exports |
| **Resolves findings** | F149, F165, F169, F170, F159, F162, F166 |
| **Candidate existing issue** | #131 |
| **Blocked by** | (none) |

## Problem

The SDK's signing-path correctness rests on third-party packages whose published version constraints are wider than what was ever built or tested. Every one of these packages either constructs a signer, derives a funds-receiving address, or builds/validates calldata. The manifest pins none of them to a tested range, and the published constraints permit a consumer's fresh install to silently resolve a different build than the one this repo's CI exercises. On a DeFi SDK the failure modes are concrete and fund-safety-bearing:

- **A consumer signs with an untested viem.** The repo builds and tests against `viem@2.33.0`, but that pin lives only in the non-shipped workspace `pnpm.overrides` (root `package.json:53`). The published SDK declares `viem ^2.24.1`, so a downstream `npm install` resolves whatever 2.x is latest at install time and signs with a viem build the SDK never ran a test against (F165). Because the smart-wallet CREATE2 address and UserOp `callData` are fully delegated to viem AA internals (`toCoinbaseSmartAccount`, version `'1.1'`), a published float can relocate the deterministic, funds-receiving undeployed address and break receipt/type identity — and viem is a plain `dependency`, not a peer, so a consumer cannot even dedupe it to their own pinned viem (F170).

- **An in-range vendor bump shifts Morpho signing math silently — and the SDK's own guard moves with it.** `MarketUtils.getMarketId`, `AccrualPosition`, and `blueAbi` ride on caret-floating `@morpho-org/*` runtime deps (`blue-sdk ^4.5.1`, `blue-sdk-viem ^3.1.1`). An in-range minor can change the marketId/calldata/health derivation. The trap: `verifyMorphoMarketId` calls the *same* floating `MarketUtils.getMarketId` it is meant to check, so if the underlying derivation shifts, both the computed id and the verification recompute with the new logic and the check still returns `true` — the one guard that should fail-closed passes (F162, F159).

- **Any future major of a signer-construction SDK is accepted into a consumer install.** All 10 hosted-wallet vendor SDKs are declared as peers with unbounded `>=` ranges (no upper ceiling), so a consumer who upgrades Privy/Dynamic/Turnkey to a future breaking major pulls it into the signing path with no manifest tripwire (F169).

- **The vendor SDKs are neither optional nor lazy.** The 10 vendor peers carry no `peerDependenciesMeta.optional`, so a Turnkey-only (or Local-only) integrator is told they are missing 9 packages they will never use. Worse, the lazy `import()` the registry relies on is defeated: the node barrel eagerly value-re-exports `PrivyHostedWalletProvider`/`PrivyWallet` and the react barrel eagerly re-exports `DynamicWallet`, so a static `import` of the SDK root statically pulls `@privy-io/node` and `@dynamic-labs/ethereum` even for consumers who chose Turnkey or Local (F149).

- **The broken install never reproduces in this repo.** `autoInstallPeers` masks the missing `peerDependenciesMeta.optional`: pnpm silently auto-installs all 10 vendor SDKs in dev/CI, so the single-vendor-consumer install failure (the F149 symptom) is invisible here and ships unnoticed (F166).

Net fund-safety framing: a consumer can install the published SDK, get a green typecheck and a working demo, and still be signing transactions, deriving smart-wallet addresses, and validating Morpho market ids with vendor builds the SDK authors never tested — with no upper bound to stop a breaking major and no self-check that fails closed when the math underneath moves.

## Findings

- **F149** (medium, infra) — `packages/sdk/package.json:69-80` (peerDependencies): all 10 hosted-wallet vendor SDKs are hard peers with no `peerDependenciesMeta.optional`; the node/react barrels eagerly value-import Privy/Dynamic vendor code through static class re-exports, defeating the registry's lazy `import()`. Root cause of #131.
- **F165** (medium, infra) — root `package.json:53` (pnpm.overrides `viem: 2.33.0`) vs `packages/sdk/package.json:67` (`viem ^2.24.1`): the tested viem pin lives only in the non-shipped workspace override; the published SDK floats `viem ^2.24.1` (and `permissionless ^0.2.54`), so consumers resolve an untested 2.x and sign with a viem the SDK never tested.
- **F169** (medium, infra) — `packages/sdk/package.json:70-79` (peerDependencies): all 10 signing-path vendor SDKs pinned with unbounded `>=` ranges (no upper bound), accepting any future major of a signer-construction SDK into a consumer's install. Distinct from F149 (optionality/bundling) — this is the range-ceiling concern.
- **F170** (medium, infra) — `packages/sdk/package.json:67`; `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:11,199,205` (`toCoinbaseSmartAccount`, version `'1.1'`): viem is a plain (non-peer) dep at floating `^2.24.1` while the deterministic CREATE2 address and UserOp `callData` are fully delegated to viem AA internals; published float + dual-viem boundary can silently relocate the funds-receiving undeployed address and break receipt/type identity.
- **F159** (low, infra) — `packages/sdk/package.json:62-63` (`@morpho-org/blue-sdk ^4.5.1`, `@morpho-org/blue-sdk-viem ^3.1.1`): protocol SDKs that build/validate calldata pinned with floating caret ranges; a fresh install without the lockfile can silently bump signing-path code.
- **F162** (medium, infra) — `packages/sdk/package.json:62-64` (`@morpho-org/*` `^` ranges); `packages/sdk/src/actions/borrow/providers/morpho/marketParams.ts:16,31`: signing-path Morpho math/ABIs (`MarketUtils.getMarketId`, `AccrualPosition`, `blueAbi`) ride on caret-floating runtime deps with no exact pin; an in-range bump shifts marketId/calldata/health silently, and `verifyMorphoMarketId` calls the same floating `getMarketId` so it shifts both sides and still passes.
- **F166** (low, infra) — pnpm `autoInstallPeers` (pnpm v9 default): masks the missing `peerDependenciesMeta.optional` (F149 root) by silently auto-installing all 10 vendor SDKs, so the broken single-vendor consumer install never reproduces in this repo's dev/CI.

## Root cause

The SDK delegates signer construction, CREATE2 address derivation, and Morpho calldata/marketId math to third-party packages, but the published manifest never constrains those packages to the builds the SDK was tested against. The only effective pins (`viem@2.33.0`, the Dynamic `4.31.4` set) live in the root workspace `pnpm.overrides`, which are not shipped to consumers. Caret/`>=` ranges plus a non-shipped lockfile plus `autoInstallPeers` combine so that the repo always installs the tested graph while a consumer installs an unconstrained one, and the one self-check that could catch Morpho drift (`verifyMorphoMarketId`) is wired to the same floating dependency it is checking, so it cannot fail closed.

## Recommended approach

This is an infra/manifest hardening ticket on the published SDK — fail-closed where the SDK already knows the tested range, and make optionality explicit. No new runtime validation logic, no refuse-to-sign behavior.

1. **Pin the signing-path runtime deps to the tested ranges.** Move the effective pins out of the non-shipped root `pnpm.overrides` and into `packages/sdk/package.json` as shipped constraints. At minimum constrain `viem`, `permissionless`, and the `@morpho-org/*` packages so the published SDK cannot resolve outside the tested band (e.g. exact-pin or a tight `>=tested <next-major` range for viem; tight ranges for `@morpho-org/blue-sdk` / `blue-sdk-viem`). The exact range syntax is an implementation choice; the invariant is: a consumer's fresh `npm install` resolves a viem/permissionless/Morpho build inside what CI tested (F165, F159, F162).

2. **Demote viem to a peer (or pin exactly) for the smart-wallet path.** The dual-viem boundary (nested viem vs consumer viem) is what lets a CREATE2 address relocate and a receipt/error type drift. Demoting viem to a `peerDependency` lets the consumer dedupe to a single viem; if a peer is too disruptive for the EOA/swap-only consumers, an exact pin is the fallback. Either way the deterministic-address derivation must run against the same viem the SDK tested (F170). Pair with the golden-vector CREATE2 test tracked under F171/#131 so an out-of-band relocation trips CI.

3. **Add upper bounds to the 10 vendor peer ranges.** Replace unbounded `>=x` with `>=x <next-major` (or the tested major band) so a future breaking vendor major is not silently accepted into the signing path (F169).

4. **Make the vendor peers optional and the barrels lazy.** Add `peerDependenciesMeta.optional: true` for all 10 hosted-wallet vendor SDKs so single-vendor consumers stop being told they are missing packages they never use (F149). Then break the eager value re-exports in `packages/sdk/src/wallet/node/index.ts:1,7` (Privy) and `packages/sdk/src/wallet/react/index.ts:5` (Dynamic) so a static SDK-root import does not pull `@privy-io/node` / `@dynamic-labs/ethereum` for Turnkey/Local-only consumers — restoring the lazy `import()` invariant Turnkey already honors.

5. **Make the broken install reproducible in CI.** `autoInstallPeers` hides the F149 symptom locally. Add a CI check (or a fixture install) that installs the published SDK as a single-vendor consumer with peer auto-install off, so a regression in optionality fails CI instead of shipping (F166). The broader CI dependency-review/`--frozen-lockfile` hygiene is tracked separately (F167/#432) — reference, do not duplicate here.

6. **Close the `verifyMorphoMarketId` self-reference (fail-closed).** Pinning the `@morpho-org/*` range (step 1) is the primary mitigation, but the guard remains structurally weak as long as `verifyMorphoMarketId` recomputes via the same floating `getMarketId` it checks. Strengthening it to compare against a pinned expected id (e.g. the value in `deployments.json` / a golden vector) rather than a freshly-recomputed one would let it actually fail closed on a derivation shift. That is a behavior change to a fund-safety guard and should be scoped against the Morpho marketId-binding ticket; flag it as needing product/eng sign-off on whether the guard hard-fails provider construction.

Note: no demo/CLI changes are in scope for this ticket. The demo/CLI consume the SDK and inherit its pins; any consumer-side dependency cleanup there is review-only, no architectural refactor.

## Affected files

- `packages/sdk/package.json:58-68` — runtime `dependencies`: caret-floating `viem`, `permissionless`, `@morpho-org/*`, `@aave/*`, `ethers`.
- `packages/sdk/package.json:69-80` — `peerDependencies`: 10 vendor SDKs with unbounded `>=`, no `peerDependenciesMeta.optional`.
- `package.json:50-69` — root workspace `pnpm.overrides` / `peerDependencyRules` where the effective `viem@2.33.0` and Dynamic `4.31.4` pins currently (non-shippably) live.
- `packages/sdk/src/wallet/node/index.ts:1,7` — eager value re-export of `PrivyHostedWalletProvider` / `PrivyWallet`.
- `packages/sdk/src/wallet/react/index.ts:5` — eager value re-export of `DynamicWallet`.
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:11,199,205` — viem `toCoinbaseSmartAccount` CREATE2 derivation, version `'1.1'`.
- `packages/sdk/src/actions/borrow/providers/morpho/marketParams.ts:16,31` — `computeMorphoMarketId` / `verifyMorphoMarketId` both calling the floating `MarketUtils.getMarketId`.

## Acceptance criteria / tests

- Published `packages/sdk/package.json` constrains `viem`, `permissionless`, and `@morpho-org/blue-sdk` / `blue-sdk-viem` to the CI-tested band; resolving outside that band is not possible from a fresh consumer install (verified by installing the packed tarball in a clean fixture and asserting the resolved versions).
- The 10 vendor peer ranges carry an upper bound (no bare `>=`).
- All 10 vendor peers are marked `peerDependenciesMeta.optional: true`; a fixture install selecting only one vendor (peer auto-install off) succeeds with no errors for the other 9.
- A static `import` of the SDK root in the fixture does not load `@privy-io/node` or `@dynamic-labs/ethereum` when the consumer uses Turnkey/Local only (assert via a module-load probe or a bundler analysis that those vendors are not in the eager graph).
- viem is dedupe-able to the consumer's pinned viem (peer) or exact-pinned; the smart-wallet CREATE2 golden-vector test (F171) pins the derived address to a known constant and trips on an out-of-range viem.
- CI runs the single-vendor fixture install with peer auto-install disabled, so the F149 optionality regression fails CI rather than shipping silently.
- (Conditional, needs sign-off) `verifyMorphoMarketId` compares against a pinned expected id so a derivation shift in `@morpho-org/*` fails the check instead of passing.

## Notes

- Scope is the **published** manifest and the eager-barrel re-exports — not the import set itself. The pass-closure findings (F168, F175) confirm the wallet-core/core-services runtime third-party surface is materially needed on the hot path and not demotable; the risk here is version-integrity and optionality, not removing imports.
- This ticket pairs tightly with the smart-wallet CREATE2 golden-vector and export-snapshot work also tracked under #131 (F171). Pinning viem without the golden vector leaves a gap; the golden vector without pinning leaves CI red on every in-range bump. Land them together.
- F159/F162/F166 carry candidate issues #255/#432 in the ledger; this ticket folds them into the #131 dependency-pinning effort because they share the same root (non-shipped pins + floating ranges). Cross-reference rather than open parallel issues. The CI dependency-review/`--frozen-lockfile` hygiene (F167) and the protocol-SDK demotion-to-dev-only work (F156/F163, swap's F152) are separate tickets under #432/#255/#328 and are not in scope here.
- The `verifyMorphoMarketId` hardening (step 6) is the only behavior change in this ticket and is gated on product/eng sign-off; everything else is manifest/barrel hardening with no runtime behavior change.

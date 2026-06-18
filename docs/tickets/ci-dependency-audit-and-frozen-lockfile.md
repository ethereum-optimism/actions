# Add CI dependency audit, frozen-lockfile install, and ship the lockfile

> **AUGMENT existing issue #432** - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| Field | Value |
| --- | --- |
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | infra |
| **Surface** | `.github/workflows/build-images.yaml`, `packages/sdk/package.json` manifest-wide pinning, published lockfile |
| **Resolves findings** | F167, F176, F155, F160 |
| **Candidate existing issue** | #432 |
| **Blocked by** | `sdk-dependency-pinning-and-optionality` |

## Problem

The Actions SDK sits on the signing path: `viem`/`permissionless` build EIP-712 and Permit2 signature payloads, encode calldata, and sign account-abstraction UserOps. Today there is no CI gate that would notice if a malicious or vulnerable transitive update slipped into that graph before publish.

Concretely, three gaps compound:

1. **No dependency security review in CI.** The only GitHub workflow is `build-images.yaml`; there is no `pnpm audit`, OSV-Scanner, or `dependency-review-action` step anywhere in `.github/`. A known-CVE or compromised transitive package entering the `viem -> ox` / `permissionless -> ox` signing graph would not be flagged by any automated check.
2. **No frozen-lockfile install outside release.** `--frozen-lockfile` runs only in `release:publish` (`package.json:24`). The CI build path (and any future test/lint job) installs with a mutable lockfile, so a transitive resolution can drift between what was reviewed and what gets built.
3. **No published lockfile, and pinning rests on a non-shipped override.** Every SDK runtime dependency is a caret range (`packages/sdk/package.json:58-68`) and the only thing collapsing `viem` drift is the workspace-root `pnpm.overrides` pin of `viem: 2.33.0` (`package.json:53`), which does not travel with the published package. The SDK's `files` array ships `dist/*` + `src/*` only (`packages/sdk/package.json:18-21`), so downstream integrators resolve the unpinned `^2.24.1` floor with no lockfile to reproduce the tested tree.

Fund-safety framing: the signing path is where calldata and signature payloads are produced. A silent transitive bump into that path (a new `viem` minor, an `ox` change, a vendored Morpho/AA dep) can alter signed bytes with zero code diff and zero install-time signal. The fix is a CI gate that catches drift and known CVEs before publish, plus a shipped lockfile so consumers can reproduce the reviewed tree. F155 and F160 establish the current baseline this gate must protect: the SDK runtime tree is presently CVE-clean (so the gate should pass green today and only fire on regression), and the Morpho path delegates signed calldata to a caret-floating third party with no in-SDK decode-back, which is exactly the class of drift a frozen-lockfile + dependency-security gate is meant to surface.

## Findings

- **F167** - No CI dependency review and no `--frozen-lockfile` install outside `release:publish`. `.github/workflows/build-images.yaml:1` is the only workflow; `--frozen-lockfile` appears solely at `package.json:24`. A malicious/vulnerable transitive update into the `viem`/`permissionless` signing graph would not be caught before publish.
- **F176** - Manifest-wide umbrella: all SDK runtime deps are caret (`packages/sdk/package.json:58-68`), all 10 hosted-wallet peers are unbounded `>=` (`packages/sdk/package.json:69-80`), there is no published lockfile, and pinning rests entirely on the non-shipped root `pnpm.overrides` (`package.json:51-63`). A full `pnpm audit` reports 74 high + 1 critical, but the critical is `vitest` (dev-only) and every high/critical resolves under `packages/demo/frontend` or devDeps - none on a `packages/sdk` runtime path.
- **F155** - Reconciliation baseline (swap): the 53 high-severity advisories all originate in the hosted-wallet / Solana / react / demo closure, not the swap runtime, which resolves to a single consistent `viem@2.33.0`. The swap signing/encoding path imports none of the advisory-bearing packages, so the new gate should pass clean for the SDK runtime today.
- **F160** - Reconciliation baseline (lend): the Morpho signing-path calldata is taken straight from `@morpho-org/blue-sdk-viem` `MetaMorphoAction.deposit/withdraw` with no decode-back (`packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:1,64,110`), and that dep floats on a caret range - the precise drift vector a frozen-lockfile + dependency-security gate is meant to surface. (The decode-back assertion itself is the separate `lend` ticket; this ticket only adds the CI/lockfile gate that would catch an un-reviewed bump.)

## Root cause

The repo was set up with a single image-build workflow and a release-time frozen install, but never grew a PR-time dependency-security gate or a consumer-facing lockfile. Version integrity currently depends on developer-side mechanisms (`pnpm.overrides`, the workspace lockfile) that are correct in-repo but do not travel to published consumers, leaving the signing dependency graph unguarded against drift and known CVEs at exactly the boundary where it matters most.

## Recommended approach

SDK / infra changes (in scope - this is the deliverable):

1. **Add a dependency-security CI job** that runs on pull requests and gates on high/critical advisories in the runtime (prod) graph. Use `pnpm audit --prod` (or OSV-Scanner / GitHub `dependency-review-action`) so the check scopes to the shipped SDK tree, not the demo/frontend closure. Per the F155/F176 reconciliation, the SDK runtime is currently CVE-clean, so this gate passes green today and only fires on a real regression. Allowlist/document the known demo-frontend and devDep advisories under #432 so the gate is not perpetually red on out-of-runtime-path noise.
2. **Add `--frozen-lockfile` to the CI install path** (the build job and any test/lint job), matching the `release:publish` behavior, so a transitive resolution cannot drift un-reviewed between PR and build.
3. **Ship a frozen lockfile.** Either add the lockfile to the SDK's published `files` (`packages/sdk/package.json:18-21`) or otherwise make the tested resolution reproducible by consumers, so the published package no longer relies on the non-shipped root `pnpm.overrides` (`package.json:51-63`) for `viem`/signing-graph pinning. Document that consumers are responsible for pinning `viem` to the tested `2.33.0` when they do not install from the lockfile.

Blocked-by note: the bounded-range / `peerDependenciesMeta.optional` manifest work is tracked separately (`sdk-dependency-pinning-and-optionality`, F169/F149); land that first so the shipped lockfile and the dependency-security gate sit on top of already-narrowed ranges rather than re-deriving them.

Demo / CLI: out of scope for this ticket. No demo or CLI changes here; the `packages/demo/frontend` advisories are review-only under #432 (no architectural refactor) and explicitly excluded from the SDK-runtime gate.

## Affected files

- `.github/workflows/build-images.yaml:1` - only workflow present; no dependency-security or frozen-install step (add the new gate here or in a sibling workflow).
- `package.json:24` - `--frozen-lockfile` confined to `release:publish`.
- `package.json:51-63` - workspace-only `pnpm.overrides` pinning `viem: 2.33.0`, not shipped to consumers.
- `packages/sdk/package.json:18-21` - `files` array ships `dist/*` + `src/*`; no lockfile published.
- `packages/sdk/package.json:58-68` - runtime `dependencies`, all caret ranges.
- `packages/sdk/package.json:69-80` - hosted-wallet `peerDependencies`, all unbounded `>=`.
- `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:1,64,110` - caret-floating signed calldata source (F160 drift vector this gate protects).

## Acceptance criteria / tests

- A CI job runs on pull requests, installs with `--frozen-lockfile`, and runs a dependency-security check (`pnpm audit --prod` / OSV-Scanner / `dependency-review-action`) scoped to the SDK runtime (prod) graph.
- The job **fails** on a newly introduced high/critical advisory on a `packages/sdk` runtime dependency path, and **passes** on the current tree (per F155/F176, the SDK runtime is CVE-clean today).
- Known demo-frontend / devDep advisories are allowlisted or scoped out so the gate is not red on out-of-runtime-path noise; the allowlist is documented under #432.
- `grep -rln 'pnpm audit\|npm audit\|audit-ci\|snyk\|dependency-review\|osv' .github/` now matches the new job (currently matches nothing).
- A lockfile is reproducible by published-package consumers (shipped in `files` or equivalent), verified by a clean `--frozen-lockfile` install from the published artifact.
- A frozen-lockfile install regression test: mutating the lockfile out of sync with the manifest causes the CI install to fail rather than silently re-resolve.

## Notes

- This ticket augments **#432** (the Wiz main-branch scan reconciliation). The F155/F176 reconciliation already establishes that the SDK runtime tree is currently clean of known CVEs and that the high/critical advisories live under the demo-frontend / hosted-wallet / Solana / react closure or devDeps; the new gate codifies that boundary so a future regression onto the SDK runtime path is caught automatically.
- Scope discipline: this is install/CI hygiene plus shipping the lockfile. It does **not** add the decode-back assertion for the Morpho calldata path (F160 logic fix - separate `lend` ticket) and does **not** narrow the dependency ranges or add `peerDependenciesMeta.optional` (the blocked-by `sdk-dependency-pinning-and-optionality` ticket, F169/F149). Those are referenced only as the drift surface this gate protects.
- The integrator-supplies-their-own-RPC assumption is documented elsewhere and out of scope; this ticket is strictly about the dependency graph and lockfile, not RPC trust.

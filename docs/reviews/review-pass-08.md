# Review Pass 08 — Dependency-Auditor (Supply Chain)

**Pass:** 8
**Skill / lens:** dependency-auditor — runtime-vs-dev classification of heavy third-party packages (ethers, @aave/*, @morpho-org/*, permissionless, viem, hosted-wallet vendor SDKs), dependency-range / pinning integrity on the signing path, lockfile + `pnpm audit` reconciliation with the Wiz main-branch scan (#432), vendored-constant / vendored-ABI provenance, and eager-vs-lazy load of the protocol-SDK closure
**Surfaces:** swap, lend, borrow, wallet-core, wallet-hosted, wallet-smart, core-services

## Summary

This pass audited each surface through a supply-chain lens: which heavy third-party packages it imports **at runtime**, whether each is materially needed or demotable to dev-only, how tightly the signing-path dependencies are pinned for *published* consumers (not just the workspace lockfile), and how the `pnpm audit` advisory set reconciles against the Wiz scan tracked in #432. Four themes dominate:

1. **The heavy protocol-SDK closure (ethers@5, @aave/*, @morpho-org/*) is eagerly static-linked for every consumer** even though each surface uses only a slice of it. The swap surface's *only* third-party runtime import is `viem`; the Aave **borrow** provider is `viem`-only; ethers@5 has a **single** runtime import site SDK-wide (`actions/lend/providers/aave/sdk.ts`, a read-only RPC call) yet ships as a hard `dependency` to all consumers; and `@morpho-org/blue-sdk-viem` is pulled in full just for a few static ABI constants. This is the protocol-SDK sibling of F149/#131 (which covers the hosted-wallet **peer** SDKs): same eager-static-barrel root cause, a different and non-optional dependency class (F152, F156, F157, F163, F164, F175).

2. **The signing-path dependency versions that consumers actually resolve are looser than what is tested.** `viem` is force-pinned to `2.33.0` only by the monorepo root `pnpm.overrides`, which does **not** travel into the published package — the SDK itself declares `viem: ^2.24.1`, so a downstream integrator signs with whatever 2.x is newest at install time, with a second nested viem copy breaking account-abstraction type identity (F165, F170). The 10 hosted-wallet vendor SDKs use unbounded `>=` peer ranges that accept any future major into the signer-construction path (F169). The @morpho-org/* math/ABI packages that derive the marketId and build deposit/withdraw/borrow calldata float on caret ranges (F159, F162). And there is no published lockfile, no `peerDependenciesMeta.optional`, and no CI audit / `--frozen-lockfile` gate outside `release:publish` (F167, F176).

3. **Vendored third-party artifacts on the signing path have weak/no provenance and no decode-back integrity guard.** The hand-rolled Uniswap/Velodrome router encoders have no official-SDK differential oracle (the misleadingly-named `sdk.test.ts` validates the encoder against itself), so the dense F046/F047/F004/F005/F048 encoding-math cluster has no external reference anchor (F153); the vendored router/factory addresses that become the signed `to`/Permit2 spend target carry no pinned source or registry-match test (F154); the Coinbase smart-wallet factory address + full ABI are copy-pasted with no upstream-commit pin or on-chain integrity test (F172); and the Morpho deposit/withdraw calldata is taken straight from `MetaMorphoAction` with no `decodeFunctionData` round-trip, unlike the Aave sibling that builds against a local pinned ABI (F160).

4. **The advisory set reconciles cleanly: the SDK's shipped runtime tree is free of known CVEs.** `pnpm audit --prod` reports ~111 advisories (53 high), but every high/critical resolves under the hosted-wallet / Solana / `react` / `packages/demo/frontend` vendor closure or devDeps (the critical is `vitest`, dev-only) — **none** lands on a `packages/sdk` runtime dependency path. The swap, borrow-Aave, wallet-core, and wallet-smart runtimes are `viem`-only and advisory-clean; the one concrete CVE that does reach SDK runtime is unpatched `elliptic 6.6.1` (GHSA-848j-6mx2-7j84) riding in via ethers@5's signing-key, which the ethers@5 demotion (F156) removes (F155, F158, F161, F176 reconciliation).

**Incoming findings:** 31 across 7 surfaces.
**Outcome:** 25 NEW (F152–F176), 2 REFINES, 4 DUP. Deduped against the existing ledger; the F149/#131 peer-SDK root cause and the F014 Aave-RPC read-path finding were respected and not re-filed — the protocol-SDK *hard-dependency* axis, the *published-range* pinning axis, and the *vendored-artifact provenance* axis are filed as distinct new loci because each fix lands in a different manifest field, module, or test.

**Counts by severity (NEW + REFINES recorded — 27 rows):**
- medium: 11
- low: 16

**Notable highlights:**
- **The published signing-path dependency != the tested one.** `viem` is pinned to `2.33.0` only via the workspace `pnpm.overrides`, which is not shipped; the SDK declares `viem: ^2.24.1`, so a consumer resolves an untested 2.x and gets a second nested viem copy. On the smart-wallet path this means the deterministic CREATE2 address (delegated to `toCoinbaseSmartAccount('1.1')`) and account-abstraction type identity can silently drift from what the SDK computed — funds could be sent to a divergent undeployed address (F165, F170). No golden-vector test pins that address to a known constant (F171).
- **The swap surface's entire third-party runtime closure is one package: `viem`.** Zero runtime imports of ethers, @aave/*, @morpho-org/*, permissionless, or any vendor SDK. Yet a swap-only consumer still installs and static-links the whole Aave/Morpho/ethers closure through the eager root barrel, with no per-action subpath export and no dynamic-import boundary (F152). Same eager-static-barrel pathology forces ethers@5/@aave onto Morpho-only integrators (F157) and onto borrow-only consumers (F164).
- **ethers@5 is a whole second web3 library carried for one read-only RPC call.** Its single SDK-wide runtime import (`aave/sdk.ts` `getReserve`) is demotable to a dev-only differential oracle / viem-backed adapter; demoting it also drops the unpatched `elliptic 6.6.1` ECDSA CVE from the runtime closure and lets the tree converge off the dual ethers v5/v6 split (F156, F158, F161).
- **The hand-rolled router encoders have no external correctness anchor.** All Uniswap/Velodrome calldata is built on viem primitives with vendored ABIs and addresses (a good attack-surface reduction), but the test that looks like a cross-check validates the encoder against itself — the F046/F047/F004/F005/F048 fund-loss encoding cluster has no official-SDK differential oracle (F153), and the vendored router/factory addresses that become the signed spend target have no provenance pin or registry-match test (F154).
- **The Morpho signing path trusts a caret-floating third party with no decode-back.** `MetaMorphoAction.deposit/withdraw` output flows straight into `transaction.data` with no `decodeFunctionData` assertion that the encoded args match the caller-supplied amount/receiver/owner, asymmetric with the Aave sibling that builds against a local pinned ABI; a buggy/compromised in-range `blue-sdk-viem` minor could alter signed calldata undetected (F160, F159, F162).
- **The advisory set is clean for SDK runtime.** All 53 high-severity `pnpm audit` advisories resolve under the hosted-wallet / Solana / react / demo closure (F149/#131 territory) — none hits a `packages/sdk` runtime path; the SDK ships CVE-free except the ethers@5-borne `elliptic` item that F156 removes (F155, F176 reconciliation for #432).

---

## Surface: swap

### F152 (NEW) — swap-only consumers inherit ethers + @aave/* + @morpho-org/* as hard dependencies eagerly linked through the static root barrel
- **Surface:** swap
- **File:** packages/sdk/package.json (dependencies: ethers@^5.7.2, @aave/contract-helpers, @aave/math-utils, @morpho-org/*); src/index.ts:8,13
- **Severity:** medium
- **Class:** infra
- **Title:** Swap-only consumers inherit ethers + @aave/* + @morpho-org/* as hard `dependencies` eagerly linked through the static root barrel (lend/borrow analog of F149/#131, on the protocol-SDK axis)
- **Detail:** The swap surface (`packages/sdk/src/actions/swap/**`) imports exactly ONE third-party runtime package: `viem`. It has zero runtime imports of ethers, @aave/contract-helpers, @aave/math-utils, @morpho-org/blue-sdk, @morpho-org/blue-sdk-viem, @morpho-org/morpho-ts, or permissionless (verified by grep across all non-test swap files). Yet all of these are declared as hard `dependencies` in `packages/sdk/package.json`, and the root barrel `src/index.ts:13` statically re-exports `MorphoLendProvider` (pulling @morpho-org/*) and `src/index.ts:8` re-exports `computeAaveBorrowMarketId` (pulling the aave path). ethers@5.7.2 (~2.8MB) has a SINGLE runtime import site in the whole SDK: `actions/lend/providers/aave/sdk.ts`; @aave/* is likewise confined to that one Aave provider file; @morpho-org/* is confined to lend/borrow Morpho providers. There are no dynamic `import()` boundaries around any heavy protocol provider and the package exports map only `.`, `./react`, `./node` (no per-action subpath), so a consumer who imports only the swap action still installs and statically links the entire Aave/Morpho/ethers closure. F149/#131 covers the 10 hosted-wallet vendor SDKs as peerDependencies; this is the distinct sibling for the protocol-SDK hard `dependencies`: same root cause (eager static barrel defeating tree-shaking / lazy-load) but a different, non-optional dependency class.
- **Exploit/repro:** A swap-only `import { ... } from '@eth-optimism/actions-sdk'` resolves `src/index.ts`, whose static `export { MorphoLendProvider }` (:13) and `computeAaveBorrowMarketId` (:8) pull `@morpho-org/*` and the Aave path into the module graph; the package install also pulls ethers@5 and @aave/* as hard deps even though no swap code path imports them.
- **Recommendation:** Treat the heavy protocol SDKs (ethers, @aave/*, @morpho-org/*) as lazy-loaded behind dynamic `import()` inside their respective lend/borrow providers, and/or add per-action subpath exports so a swap-only consumer can import `@eth-optimism/actions-sdk/swap` without pulling the Aave/Morpho/ethers closure. At minimum, document in #131's scope that the protocol-SDK deps (not just the hosted-wallet peers) are the eager-load offenders. For swap specifically: `viem` is the only material runtime dependency and is NOT demotable; everything else is dead weight for swap consumers.
- **suggestRefactor:** true
- **Candidate issue:** #131
- **Relates to prior finding:** F149
- **Dedup status:** new

### F153 (NEW) — all swap router calldata is hand-rolled on viem with no official Uniswap/Velodrome SDK as a differential oracle
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/uniswap/encoding.ts:1-30,224-294; providers/velodrome/encoding/routers/v2.ts; providers/velodrome/encoding/routers/cl.ts
- **Severity:** medium
- **Class:** correctness
- **Title:** All swap router calldata is hand-rolled on viem primitives with no official Uniswap/Velodrome SDK as a differential oracle — the misleadingly-named `sdk.test.ts` validates the encoder only against itself
- **Detail:** The Uniswap V4 / Universal Router and Velodrome v2/leaf/CL router encoders build signed calldata entirely from viem primitives (`encodeAbiParameters`, `encodeFunctionData`, `keccak256`) with vendored ABI fragments in `providers/uniswap/abis.ts` and `providers/velodrome/abis.ts`. There is deliberately NO dependency on @uniswap/v4-sdk, @uniswap/universal-router-sdk, @uniswap/sdk-core, or any Velodrome/Aerodrome SDK. From a supply-chain standpoint this is a GOOD reduction of third-party attack surface and bundle size. The risk it creates: the test that looks like a cross-check, `providers/uniswap/__tests__/sdk.test.ts`, imports only viem + the SDK's own encoding module (`encodeUniversalRouterSwap`, `getQuote`, `calculatePriceImpact`) and asserts the encoder against itself — it is not a differential oracle against Uniswap's reference encoder. The large cluster of fund-loss/correctness encoding findings already in the ledger (F046 V4 TAKE_ALL ignores recipient, F047 Velodrome native-in misencode, F004 native-in exact-output placeholder value, F005/#318 slippage min-out/max-in recompute, F048 amountInMaximum) all live in this hand-rolled code with no independent reference to catch a divergence. This is the supply-chain framing of #318 (validate encoding math against the Uniswap SDK): the gap is the absence of a vetted reference implementation used as a test oracle.
- **Exploit/repro:** `sdk.test.ts` imports only `viem` and the SDK's own `encodeUniversalRouterSwap`/`getQuote`/`calculatePriceImpact`; there is no `@uniswap/*` import anywhere in the test tree, so a divergence between the hand-rolled encoder and Uniswap's reference encoding (the locus of F046/F047/F004) cannot be caught.
- **Recommendation:** Add a dev-only (`devDependency`, never runtime) differential-oracle test that encodes representative swaps with @uniswap/v4-sdk / @uniswap/universal-router-sdk and asserts byte-equality against the hand-rolled calldata for exact-in, exact-out, native-in, and recipient-bearing cases; mirror with a Velodrome reference where available. Keeping the reference SDK in devDependencies preserves the lean runtime closure while giving the signing-path encoders an external correctness anchor. Flag only — do not add the runtime dependency.
- **suggestRefactor:** true
- **Candidate issue:** #318
- **Relates to prior finding:** F046
- **Dedup status:** new

### F154 (NEW) — vendored router/poolManager/factory addresses that feed signed calldata are hardcoded with no pinned-source provenance or registry-match test
- **Surface:** swap
- **File:** packages/sdk/src/actions/swap/providers/uniswap/addresses.ts:30-114; providers/velodrome/addresses.ts:1-107
- **Severity:** low
- **Class:** info
- **Title:** Vendored router/poolManager/factory addresses that feed signed calldata are hardcoded with no pinned-source provenance or registry-match test
- **Detail:** `UNISWAP_ADDRESSES` (universalRouter, poolManager, positionManager, quoter per chain) and the Velodrome/Aerodrome per-chain router/poolFactory/clPoolFactory/clQuoterV2 maps are hardcoded address literals. These addresses are the spend targets baked verbatim into router calldata the user signs (the universalRouter / velodrome router is the contract granted Permit2 allowance and the `execute()` target). Provenance is weak: `uniswap/addresses.ts` carries only a docs link (`@see docs.uniswap.org/contracts/v4/deployments`) pinned to no version/commit, and `velodrome/addresses.ts` has no source link at all. There is no test asserting these literals match an authoritative deployment registry (e.g. Uniswap's deployment JSON or the superchain/Velodrome registry), so a copy-paste error or a future malicious edit to a single address constant would route a signed swap (and its Permit2 approval) to an attacker-controlled contract with no automated tripwire. This is a vendored-constant supply-chain hygiene gap on the signing path, distinct from RPC trust (out of scope).
- **Exploit/repro:** A one-character edit to a `universalRouter`/velodrome router address constant changes the signed `execute()` target and the Permit2 spend target with no failing test; provenance comments do not pin a commit/version to detect drift.
- **Recommendation:** Pin each address block to an immutable source (deployment-registry commit hash or on-chain-verified snapshot) in a comment, and add a test that asserts the vendored router/factory addresses match a checked-in registry fixture so an accidental or malicious single-character address change fails CI. Treat the universalRouter / velodrome router and Permit2 spend target as security-critical constants, not configuration.
- **suggestRefactor:** false
- **Candidate issue:** #328
- **Relates to prior finding:** none
- **Dedup status:** new

### F155 (NEW) — Wiz/pnpm-audit reconciliation: swap surface is clean of the 53 high-severity advisories
- **Surface:** swap
- **File:** pnpm-lock.yaml (viem@2.33.0 entries); `pnpm audit --prod` summary
- **Severity:** low
- **Class:** info
- **Title:** Wiz/pnpm-audit reconciliation: the swap surface is clean of the 53 high-severity advisories — they all originate in the hosted-wallet/react peer-SDK closure, not the swap runtime
- **Detail:** `pnpm audit --prod` reports 111 advisories (53 high / 53 moderate / 5 low). The high-severity items (preact JSON VNode injection, react-router XSS/CSRF, valibot ReDoS, bigint-buffer buffer overflow) all originate in the Privy/Dynamic/Turnkey + Solana/react peer-dependency closure (F149/#131 territory) and the demo frontend, NOT in the swap surface. The swap surface's entire third-party runtime closure resolves to a single, consistent viem@2.33.0 (plus the separate @eth-optimism/viem@0.4.14 wrapper); there is no version skew (the apparent viem@3.x/0.x lockfile hits are `blue-sdk-viem@3.2.0` and unrelated web3 packages, not viem itself) and no advisory hits viem or ethers. This is recorded as info to reconcile with #432 (Wiz main-branch scan): the swap encoding/signing path does not import any of the advisory-bearing packages, so swap is not a vector for those CVEs; remediation effort for the high-severity audit findings should target the hosted-wallet peer SDKs and the demo app, not swap.
- **Exploit/repro:** Tracing each high-severity advisory's dependency path shows it resolves under the hosted-wallet vendor / Solana / react / demo closure; none traces through any `packages/sdk/src/actions/swap/**` import.
- **Recommendation:** In the #432 Wiz reconciliation, scope the 53 high-severity advisories to the hosted-wallet peer SDKs / Solana / react / demo closure and explicitly exclude the swap (and SDK core viem) runtime, which is audit-clean. No swap-side dependency change is warranted; keep viem pinned/consistent.
- **suggestRefactor:** false
- **Candidate issue:** #432
- **Relates to prior finding:** F149
- **Dedup status:** new

---

## Surface: lend

### F156 (NEW) — ethers@5 + @aave/contract-helpers + @aave/math-utils are runtime deps used ONLY on the Aave read path, demotable to dev-only
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/sdk.ts:1-3,118,121,151
- **Severity:** medium
- **Class:** infra
- **Title:** ethers@5 + @aave/contract-helpers + @aave/math-utils are runtime deps used ONLY on the Aave read path (`getReserve`/`getReserves` display), never on signing — demotable to dev-only
- **Detail:** `aave/sdk.ts` value-imports `ethers` (line 3+118), `@aave/contract-helpers` `UiPoolDataProvider` (line 1+121), and `@aave/math-utils` `formatReserves` (line 2+151), all consumed only by `getReserve`/`getReserves` for `LendMarket` display. The Aave signing path is independent: `AaveLendProvider._buildERC20OpenPosition`/`_buildETHOpenPosition`/`_closeETHPosition`/`_closeERC20Position` (AaveLendProvider.ts:229,264,314,359) build calldata via viem `encodeFunctionData` against local `POOL_ABI`/`WETH_GATEWAY_ABI` and never import ethers/@aave. As statically-imported `dependencies`, every SDK consumer ships three heavy protocol-SDK trees for a read viem covers.
- **Exploit/repro:** A Morpho-only config still bundles ethers@5/@aave via `module.ts -> lend/index.ts -> AaveLendProvider.ts:28 -> sdk.ts:1-3` static imports.
- **Recommendation:** Reimplement `getReserve` on viem and move `@aave/contract-helpers`, `@aave/math-utils`, `ethers` to `devDependencies` as a fork-test differential oracle. Otherwise hide the read path behind a dynamic import. Flag only.
- **suggestRefactor:** true
- **Candidate issue:** #255
- **Relates to prior finding:** F149
- **Dedup status:** new

### F157 (NEW) — eager static import chain forces the Aave/ethers@5 protocol-SDK tree onto Morpho-only integrators
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/module.ts:1; lend/index.ts:2; lend/providers/aave/AaveLendProvider.ts:28
- **Severity:** medium
- **Class:** infra
- **Title:** Eager static import chain forces the Aave/ethers@5 protocol-SDK tree onto Morpho-only integrators (lend analog of #131/F149)
- **Detail:** No dynamic import exists in `lend/`, `shared/aave`, or `shared/morpho`. `module.ts:1` imports `AaveLendProvider`; `index.ts:2` re-exports it; `AaveLendProvider.ts:28` imports `./sdk.js`; `sdk.ts:1-3` value-imports @aave/* and ethers. The `if(config.aave)` guard gates *construction*, not module *evaluation*, so Morpho-only integrators still load ethers@5+@aave/*. Same eager-import pathology as F149/#131 but on the protocol-SDK axis F149 does not cover.
- **Exploit/repro:** No dynamic import in `lend/`; trace `module.ts:1 -> index.ts:2 -> AaveLendProvider.ts:28 -> sdk.ts:1-3` — all static value-imports.
- **Recommendation:** Lazy-load the `AaveLendProvider` `sdk.ts` via dynamic import behind `if(config.aave)`, or split the heavy read code into a lazily-imported submodule. Add a closure test extending #131. Flag only.
- **suggestRefactor:** true
- **Candidate issue:** #131
- **Relates to prior finding:** F149
- **Dedup status:** new

### F158 (NEW) — unpatched elliptic 6.6.1 CVE rides into the lend runtime via ethers@5 signing-key
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/aave/sdk.ts:3,118; pnpm-lock.yaml:10238
- **Severity:** medium
- **Class:** infra
- **Title:** Unpatched `elliptic 6.6.1` CVE (GHSA-848j-6mx2-7j84, no fix) rides into the lend runtime via ethers@5 signing-key, pulled by the Aave read path
- **Detail:** `pnpm audit --prod` surfaces `elliptic 6.6.1 and below` (GHSA-848j-6mx2-7j84) with no patched version. The lockfile resolves `elliptic 6.6.1` under `@ethersproject/signing-key 5.8.0` (pnpm-lock.yaml:10238), part of `ethers 5.8.0` which `aave/sdk.ts` value-imports (line 3/118) for a read-only RPC call. An unpatched ECDSA lib enters the lend runtime closure for a read viem could do. Demoting ethers@5 (F156) drops it. `pnpm audit` reports 111 advisories / 53 high; the Wiz scan #432 reports 73 high — the count delta itself needs reconciliation.
- **Exploit/repro:** `elliptic 6.6.1` at pnpm-lock.yaml:10238 under `@ethersproject/signing-key 5.8.0` inside `ethers 5.8.0` imported by `aave/sdk.ts:3`.
- **Recommendation:** Track `elliptic 6.6.1` against #432; the durable fix is removing ethers@5 from runtime (F156). Stopgap: a `pnpm` override or a documented acceptance. Reconcile the `pnpm audit` vs Wiz counts. Flag only.
- **suggestRefactor:** false
- **Candidate issue:** #432
- **Relates to prior finding:** none
- **Dedup status:** new

### F159 (NEW) — protocol SDKs that build/validate calldata are pinned with floating caret ranges; blue-sdk-viem (Morpho signing path) can silently bump
- **Surface:** lend
- **File:** packages/sdk/package.json (dependencies block)
- **Severity:** low
- **Class:** infra
- **Title:** Protocol SDKs that build/validate calldata are pinned with floating caret ranges; `blue-sdk-viem` (Morpho signing path) can silently bump
- **Detail:** Caret ranges: `@aave/contract-helpers ^1.30.0` (to 1.36.2 resolved), `@aave/math-utils ^1.30.0`, `@morpho-org/blue-sdk ^4.5.1` (to 4.13.1, 8 minors drift), `@morpho-org/blue-sdk-viem ^3.1.1` (to 3.2.0), `ethers ^5.7.2`. `blue-sdk-viem` is on the signing path (`MetaMorphoAction.deposit/withdraw`, MorphoLendProvider.ts:64,110) yet a caret lets a fresh install pull any 3.x. The committed lockfile mitigates in-repo builds but not downstream consumers who install without it or run `pnpm update`.
- **Exploit/repro:** Compare `package.json` ranges vs `pnpm-lock.yaml` resolved: `blue-sdk ^4.5.1` resolves to `4.13.1`.
- **Recommendation:** Tighten ranges on calldata-affecting SDKs (especially `blue-sdk-viem`), document a bump cadence, and require fork-test calldata re-verification on bumps. Flag only.
- **suggestRefactor:** false
- **Candidate issue:** #255
- **Relates to prior finding:** none
- **Dedup status:** new

### F160 (NEW) — Morpho signing-path calldata delegated entirely to third-party MetaMorphoAction with no decode-back check (asymmetric vs Aave local pinned ABI)
- **Surface:** lend
- **File:** packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:1,64,110
- **Severity:** low
- **Class:** correctness
- **Title:** Morpho signing-path calldata is delegated entirely to third-party `MetaMorphoAction` with no decode-back check, asymmetric with the Aave provider's local pinned ABI
- **Detail:** `_openPosition` (line 64) and `_closePosition` (line 110) take the signed deposit/withdraw calldata straight from `@morpho-org/blue-sdk-viem` `MetaMorphoAction.deposit/withdraw` with no `decodeFunctionData` round-trip asserting the encoded args match the amount/receiver/owner passed (no decode/assert/verify in the file). The Aave sibling builds calldata itself via viem `encodeFunctionData` against local `POOL_ABI`/`WETH_GATEWAY_ABI` (AaveLendProvider.ts:229,264,314,359), bounded by the in-repo ABI. Asymmetry: a buggy/compromised caret-ranged `blue-sdk-viem` minor could alter signed Morpho calldata with no in-SDK guard.
- **Exploit/repro:** No decode/assert in `MorphoLendProvider.ts`; `MetaMorphoAction` output flows into `transaction.data` at 64-74 and 110-124 unverified.
- **Recommendation:** Add a decode-back assertion in the Morpho deposit/withdraw path: `decodeFunctionData` on the `MetaMorphoAction` output, assert `functionName`+args match the caller-supplied amount/receiver/owner, mirroring #373. Flag only.
- **suggestRefactor:** true
- **Candidate issue:** #373
- **Relates to prior finding:** none
- **Dedup status:** new

### F161 (NEW) — two ethers majors resolve in the lockfile (5.8.0 for @aave, 6.16.0 for @turnkey/core), doubling the ethers surface
- **Surface:** lend
- **File:** pnpm-lock.yaml:5004,5007,13498,13540
- **Severity:** low
- **Class:** info
- **Title:** Two ethers majors resolve in the lockfile (5.8.0 for @aave, 6.16.0 for @turnkey/core), doubling the ethers crypto surface
- **Detail:** The lockfile resolves `ethers 5.8.0` (SDK direct dep, used by the lend Aave read path `sdk.ts:3`) and `ethers 6.16.0` (pulled by `@turnkey/core`, pnpm-lock.yaml:13498/13540, a hosted-wallet peerDep). Lend uses only ethers@5 but the published closure carries two ethers crypto stacks (ethers@5 → elliptic 6.6.1). Removing ethers@5 from the lend runtime (F156) lets the codebase converge on one ethers major.
- **Exploit/repro:** ethers majors in lockfile: `5.8.0` and `6.16.0`; lines 13498/13540 show `@turnkey/core` on ethers `6.16.0`.
- **Recommendation:** Track with the ethers-demotion work (F156). No lend-surface action now. Info only.
- **suggestRefactor:** false
- **Candidate issue:** none
- **Relates to prior finding:** none
- **Dedup status:** new

---

## Surface: borrow

### F162 (NEW) — signing-path Morpho math/ABIs (marketId, accrual, calldata ABIs) ride on caret-floating runtime deps with no exact pin
- **Surface:** borrow
- **File:** packages/sdk/package.json (dependencies: @morpho-org/blue-sdk ^4.5.1, @morpho-org/blue-sdk-viem ^3.1.1, @morpho-org/morpho-ts ^2.4.1)
- **Severity:** medium
- **Class:** infra
- **Title:** Signing-path Morpho math/ABIs (marketId derivation, accrual math, calldata ABIs) ride on caret-floating `^` runtime deps with no exact pin
- **Detail:** The Morpho borrow provider derives the on-chain marketId via `MarketUtils.getMarketId` (marketParams.ts:16), computes accrual/health via `new AccrualPosition` (state.ts:167) and `new Market` (blue.ts:46), and encodes supplyCollateral/borrow/repay/withdrawCollateral calldata against `blueAbi` from `@morpho-org/blue-sdk-viem` (blue.ts:73,91,109,124). All three @morpho-org/* packages are declared with caret ranges (`^4.5.1`, `^3.1.1`, `^2.4.1`). A minor/patch bump that alters the marketId keccak encoding, the `AccrualPosition` math, or the `blueAbi` shape silently changes signing-path calldata and the health/borrowApy numbers shown to users on the next `pnpm install` without a lockfile refresh. Unlike the Aave borrow provider (which vendors raw ABIs and uses only viem), the Morpho path's safety depends on a third-party library version resolved at install time. Note: `verifyMorphoMarketId` at MorphoBorrowProvider.ts:81 mitigates an outright-wrong marketId, but it itself calls the floating `MarketUtils.getMarketId`, so a library-side encoding change would shift both the computed id AND the calldata together and pass the check. Reconciles with #432 supply-chain remediation intent.
- **Exploit/repro:** Bump `@morpho-org/blue-sdk` to a minor where `MarketUtils.getMarketId` or `AccrualPosition` WAD math differs; the caret range resolves it on fresh install; borrow calldata/health silently shifts with no code diff.
- **Recommendation:** Pin `@morpho-org/blue-sdk`, `@morpho-org/blue-sdk-viem`, `@morpho-org/morpho-ts` to exact versions (or a tight `~` range) since their math/ABIs sit on the signing path, and add a CI step asserting the resolved versions match the committed lockfile (`pnpm install --frozen-lockfile`) so a transitive math/ABI change cannot land un-reviewed. Flag, do not fix.
- **suggestRefactor:** true
- **Candidate issue:** #432
- **Relates to prior finding:** none
- **Dedup status:** new

### F163 (NEW) — @morpho-org/blue-sdk-viem is a full runtime dependency used only for static ABI constants; demotable/vendorable like the Aave borrow path
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/morpho/blue.ts:2,73,91,109,124 (and state.ts:3-6,65,71,77,83)
- **Severity:** low
- **Class:** info
- **Title:** `@morpho-org/blue-sdk-viem` is a full runtime dependency used only for static ABI constants; demotable/vendorable like the Aave borrow path
- **Detail:** Across the Morpho borrow provider, `@morpho-org/blue-sdk-viem` contributes nothing but three static ABI exports: `blueAbi` (blue.ts:73,91,109,124; state.ts:65,71), `blueOracleAbi` (state.ts:35,77) and `adaptiveCurveIrmAbi` (state.ts:41,83). These are constant ABI arrays passed to viem `encodeFunctionData`/`readContract`. The sibling Aave borrow provider deliberately vendors its ABIs (`src/actions/shared/aave/abis/pool.ts -> POOL_ABI, WETH_GATEWAY_ABI`) and depends only on viem at runtime, demonstrating the codebase's own preferred pattern. Keeping `blue-sdk-viem` as a runtime dependency forces every borrow consumer to install the whole package (and its transitive graph) for a few ABI literals, widening the runtime supply-chain attack surface for no functional gain, and prevents using `blue-sdk-viem` purely as a dev-time differential oracle.
- **Exploit/repro:** grep shows `blue-sdk-viem` imports resolve to constants only; no class/function with logic is consumed from it on the borrow path.
- **Recommendation:** Consider vendoring the three needed ABIs (`blueAbi`, `blueOracleAbi`, `adaptiveCurveIrmAbi`) into a shared `morpho/abis` module mirroring the Aave borrow pattern, then demote `@morpho-org/blue-sdk-viem` to a `devDependency` used only to assert the vendored ABIs match upstream in tests. `@morpho-org/blue-sdk` (AccrualPosition/Market/MarketUtils math) is NOT demotable — keep it runtime. Flag, do not fix.
- **suggestRefactor:** true
- **Candidate issue:** #328
- **Relates to prior finding:** none
- **Dedup status:** new

### F164 (NEW) — Aave borrow provider needs zero heavy SDKs at runtime (viem-only), so @aave/* and ethers are dead weight for borrow-only consumers
- **Surface:** borrow
- **File:** packages/sdk/src/actions/borrow/providers/aave/calldata.ts:1-8 (whole-provider import graph)
- **Severity:** low
- **Class:** info
- **Title:** The Aave borrow provider needs zero heavy SDKs at runtime (viem-only), so `@aave/contract-helpers`, `@aave/math-utils` and ethers@5.7.2 are dead weight for borrow-only consumers
- **Detail:** The entire Aave borrow provider (`calldata.ts`, `state.ts`, `write.ts`, `quote.ts`, `presentation.ts`, `marketId.ts`) imports only viem plus vendored raw ABIs from `src/actions/shared/aave/`. It never touches `@aave/contract-helpers`, `@aave/math-utils`, or ethers. Those three are declared in `package.json` `dependencies` (not dev) and are pulled in by the lend Aave provider's ethers `JsonRpcProvider` usage (`sdk.ts`, F014/F156) — not by borrow. A consumer who only uses borrow still installs the @aave/* SDKs and ethers@5.7.2 (a pinned-old major alongside viem@2), inflating install size and the runtime CVE surface for code the borrow path never executes. This is the per-surface evidence the pass asked for: for borrow, @aave/* and ethers are materially demotable; for the SDK as a whole they are needed by lend.
- **Exploit/repro:** `grep -rn` for `@aave|ethers` across `borrow/providers/aave` returns nothing; the same grep on `lend/providers/aave/sdk.ts` hits the ethers `JsonRpcProvider`.
- **Recommendation:** Track as input to the broader runtime-vs-dep classification effort (per #131): the @aave/* SDKs + ethers serve only the lend Aave reserve read and could be isolated behind a lazy import / optional dep so borrow-only and Morpho-only consumers do not pull the ethers@5.7.2 + @aave/* subtree. Info only; reconcile with F156, F149/#131 and #432. Flag, do not fix.
- **suggestRefactor:** true
- **Candidate issue:** #131
- **Relates to prior finding:** F014
- **Dedup status:** new

---

## Surface: wallet-core

### F165 (NEW) — viem signing-path version is pinned to 2.33.0 only via monorepo pnpm.overrides; published SDK floats ^2.24.1
- **Surface:** wallet-core
- **File:** package.json:50-69
- **Severity:** medium
- **Class:** infra
- **Title:** The viem signing-path version is pinned to 2.33.0 only via the monorepo `pnpm.overrides`; the published SDK floats `^2.24.1`, so consumers sign with an untested viem
- **Detail:** Root `package.json` `pnpm.overrides` forces `viem: 2.33.0` (and `peerDependencyRules.allowedVersions` viem 2.33.0) for the entire workspace, so the lockfile resolves a single viem@2.33.0 and ALL wallet/core signing code (`EOAWallet.walletClient -> createWalletClient/sendTransaction` at EOAWallet.ts:8,47-67; `DefaultSmartWallet.toCoinbaseSmartAccount` at DefaultSmartWallet.ts:11,198-199) is exercised and tested against exactly that build. But pnpm overrides are a workspace-local construct: they are NOT written into the published `@eth-optimism/actions-sdk` package, whose own dependency range is `viem: ^2.24.1` (packages/sdk/package.json). A downstream integrator installing the published SDK therefore resolves whatever 2.x viem is newest at their install time, which can differ from 2.33.0 across many minors. viem's account-abstraction module (`toCoinbaseSmartAccount` UserOp encoding/hashing) and `createWalletClient`/`signTransaction` internals are the literal bytes-to-sign machinery for this surface; a tested-vs-shipped drift on that dependency is a supply-chain integrity gap on the signing path, not mere style. The same logic applies to `permissionless` (declared `^0.2.54`, resolved 0.2.57, the bundler client the smart path dispatches through), which is similarly unpinned for consumers.
- **Exploit/repro:** Publish the SDK with `viem ^2.24.1`; an integrator app resolves a different 2.x viem than 2.33.0; the SDK's signing path runs on a viem build it was never tested against.
- **Recommendation:** Tighten the published SDK's own viem (and permissionless) dependency range to the exact minor it is built and audited against (e.g. pin viem to the 2.33.x line, or `>=2.33.0 <2.34.0`), rather than relying on a workspace-only override that never reaches consumers. Document that the signing path is validated against a specific viem build. Flag only; do not change ranges blindly without re-running the network/signing tests.
- **suggestRefactor:** false
- **Candidate issue:** #131
- **Relates to prior finding:** F149
- **Dedup status:** new

### F166 (NEW) — autoInstallPeers:true masks the missing peerDependenciesMeta.optional that F149 flagged, so the consumer install failure never reproduces locally
- **Surface:** wallet-core
- **File:** packages/sdk/package.json:65-73 (pnpm-lock.yaml settings: autoInstallPeers)
- **Severity:** low
- **Class:** infra
- **Title:** `autoInstallPeers:true` in the lockfile settings masks the missing `peerDependenciesMeta.optional` that F149 flagged, so the consumer install failure never reproduces locally
- **Detail:** `pnpm-lock.yaml` settings has `autoInstallPeers: true`. Combined with the SDK declaring all 10 hosted-wallet vendor SDKs as hard `peerDependencies` WITHOUT a `peerDependenciesMeta.optional` block (confirmed absent in packages/sdk/package.json; this is the F149 root), pnpm silently auto-installs every vendor peer into the workspace tree. Effect on wallet-core: the `HostedWalletProviderRegistry`/Node+React registry subclasses are designed for lazy `await import()` of vendor providers (`NodeHostedWalletProviderRegistry.ts` correctly lazy-imports Privy/Turnkey), but `autoInstallPeers` ensures all 10 SDKs are present locally regardless, so developers never observe the broken-install experience a real consumer hits when they install only one wallet vendor. The masking means F149's defect (non-optional peers) cannot surface in this repo's own dev/CI, lowering the odds it gets fixed before a consumer reports it.
- **Exploit/repro:** `grep -m1 autoInstallPeers pnpm-lock.yaml` → `autoInstallPeers: true`; `grep -n 'peerDependenciesMeta\|optional' packages/sdk/package.json` returns nothing.
- **Recommendation:** Add `peerDependenciesMeta` with `optional:true` for all 10 hosted-wallet vendor SDKs (the F149 fix), and consider setting `autoInstallPeers:false` so the workspace install mirrors a real single-vendor consumer; add a build-without-all-peers smoke check (the intent of #131). Flag only.
- **suggestRefactor:** false
- **Candidate issue:** #131
- **Relates to prior finding:** F149
- **Dedup status:** new

### F167 (NEW) — no CI dependency audit and no lockfile-pinned install outside release:publish
- **Surface:** wallet-core
- **File:** .github/workflows/build-images.yaml:1
- **Severity:** low
- **Class:** infra
- **Title:** No CI dependency audit (pnpm audit / OSV / dependency-review) and no lockfile-pinned install outside `release:publish`, leaving the signing dependency graph unguarded against drift and known CVEs
- **Detail:** The only GitHub workflow present is `build-images.yaml`; there is no `pnpm audit`, OSV-Scanner, Socket, Snyk, or dependency-review step anywhere in `.github/`, and `--frozen-lockfile` is used only in the `release:publish` script (root package.json:24), not in the CI test/build path. For a DeFi SDK whose wallet-core signing path floats on viem and permissionless (see F165), the absence of any automated lockfile-integrity / known-CVE gate means a malicious or vulnerable transitive update into the signing graph (viem -> ox, permissionless -> ox, or any auto-installed vendor SDK) would not be caught by CI before publish. This is the systemic complement to the per-package version-skew finding and reconciles with the Wiz main-branch scan tracked in #432.
- **Exploit/repro:** `grep -rln 'pnpm audit\|npm audit\|audit-ci\|snyk\|dependency-review\|osv' .github/` finds no dependency-audit CI gate; `--frozen-lockfile` appears only in `release:publish`.
- **Recommendation:** Add a CI job that runs `pnpm audit --prod` (or OSV-Scanner / GitHub dependency-review-action) and installs with `--frozen-lockfile` on PRs, gating on high/critical advisories in the runtime (prod) graph. Reconcile results with #432. Flag only.
- **suggestRefactor:** false
- **Candidate issue:** #432
- **Relates to prior finding:** F149
- **Dedup status:** new

### F168 (NEW) — wallet-core runtime third-party surface is viem-only; nothing demotable to dev-only here (pass-closure note)
- **Surface:** wallet-core
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:11
- **Severity:** low
- **Class:** info
- **Title:** The wallet-core runtime third-party surface is `viem`-only; nothing is demotable to dev-only here (pass-closure note)
- **Detail:** Per the pass directive to report which heavy third-party packages this surface imports at RUNTIME and whether each is materially needed: the complete inventory for `wallet/core` is `viem` and `viem/account-abstraction` only. viem provides `createWalletClient`/`nonceManager` (EOAWallet.ts:8), `keccak256`/`slice`/`toHex` CREATE2 derivation (DefaultSmartWalletProvider.ts:2), `encodeFunctionData`/`erc20Abi`/`concatHex`/`decodeAbiParameters`/`isHex`/`size` (DefaultSmartWallet.ts:2-9), `getAddress`/`isAddress`/`pad` (signer utils), and `viem/account-abstraction` provides `toCoinbaseSmartAccount` + `readContract` + the receipt/account types. Every one is on the signing/dispatch hot path and materially required at runtime; none is demotable to dev-only and none is a heavy protocol SDK swappable for a differential oracle. The smart-wallet ABIs and factory address are inlined in `constants/index.ts` (no package pull). Conclusion for the supply-chain pass: wallet-core itself introduces no demotable heavy runtime dependency; its supply-chain risk is entirely the version-integrity of viem/permissionless (F165) and the install/CI hygiene gaps (F166/F167), not the import set.
- **Exploit/repro:** A grep of `wallet/core/**` non-test value-imports resolves only to `viem`, `viem/account-abstraction`, and `viem/actions`; no ethers / permissionless / @aave / @morpho / vendor-SDK imports.
- **Recommendation:** No demotion action for this surface. Record the viem-only runtime profile so future bundle/peer-dependency work (#131/#283) does not mistakenly target wallet-core. Info only.
- **suggestRefactor:** false
- **Candidate issue:** #283
- **Relates to prior finding:** F149
- **Dedup status:** new

---

## Surface: wallet-hosted

### F169 (NEW) — all 10 signing-path vendor SDKs pinned with unbounded `>=` ranges, accepting any future major into the signer construction path
- **Surface:** wallet-hosted
- **File:** packages/sdk/package.json (peerDependencies for @dynamic-labs/*, @privy-io/*, @turnkey/*)
- **Severity:** medium
- **Class:** infra
- **Title:** All 10 signing-path vendor SDKs are pinned with unbounded `>=` ranges, accepting any future major version into the signer-construction path
- **Detail:** Every hosted-wallet peerDependency uses an open-ended lower-bound range with no upper bound: `@dynamic-labs/ethereum >=4.31.4`, `@dynamic-labs/waas-evm >=4.31.4`, `@dynamic-labs/wallet-connector-core >=4.31.4`, `@privy-io/react-auth >=2.24.0`, `@privy-io/node >=0.3.0`, `@turnkey/core >=1.1.1`, `@turnkey/http >=3.12.1`, `@turnkey/sdk-server >=4.9.1`, `@turnkey/react-wallet-kit >=1.1.1`, `@turnkey/viem >=0.14.1`. These are precisely the packages whose value-imports produce the viem `LocalAccount` used to sign every transaction and EIP-712/Permit2 payload (node/react `createSigner.ts` call `createViemAccount` / `createAccount` / `toViemAccount` / `isEthereumWallet`). For a downstream integrator, `>=X` is satisfied by ANY future major version, including a compromised or behavior-changed major published after this SDK pins the floor. The repo lockfile pins exact resolved versions for the workspace, but the published peerDependency constraint that integrators resolve against has no ceiling, so an integrator's install can silently pull a far-newer major of a signing-key SDK than was ever tested. This is distinct from F149 (which is about optionality + eager-import bundling): this is a range-bound / pinning concern on the signing path.
- **Exploit/repro:** `node -e "const p=require('./packages/sdk/package.json'); for(const[k,v]of Object.entries(p.peerDependencies)) console.log(v.startsWith('>=')?'UNBOUNDED '+k+' '+v:k);"` prints all 10 as UNBOUNDED.
- **Recommendation:** Constrain each vendor peerDependency to a tested major band (e.g. `>=4.31.4 <5` for @dynamic-labs/*, `>=2.24.0 <3` for @privy-io/react-auth, `>=4.9.1 <5` for @turnkey/sdk-server) so a future untested major is rejected at install rather than silently adopted on the signer path. Re-bump the ceiling deliberately when each vendor major is validated.
- **suggestRefactor:** false
- **Candidate issue:** #131
- **Relates to prior finding:** F149
- **Dedup status:** new

### (refines:F149) — lazy-load invariant is asymmetrically violated: Turnkey stays lazy-only but Privy (node) and Dynamic (react) leak vendor SDKs eagerly via barrel re-exports
- **Surface:** wallet-hosted
- **File:** packages/sdk/src/wallet/node/index.ts:1,6 (and src/wallet/react/index.ts:5)
- **Severity:** medium
- **Class:** infra
- **Title:** The lazy-load invariant is asymmetrically violated: Turnkey stays lazy-only but Privy (node) and Dynamic (react) leak vendor SDKs eagerly via barrel re-exports
- **Detail:** The registries (NodeHostedWalletProviderRegistry.ts:28-29, ReactHostedWalletProviderRegistry.ts:28-29/45-46/62-63) document and implement provider loading via dynamic `import()` so "unused wallet SDKs are not included in the bundle". Turnkey honors this: `TurnkeyHostedWalletProvider`/`TurnkeyWallet` are reachable ONLY through the registry's lazy `import()` and are not re-exported from any barrel, so `@turnkey/viem` stays out of the static graph until Turnkey is chosen. Privy and Dynamic do NOT honor it: `wallet/node/index.ts:1` eagerly value-re-exports `PrivyHostedWalletProvider` and `:6` `PrivyWallet`, both of which statically import `wallet/node/wallets/hosted/privy/utils/createSigner.ts` which value-imports `@privy-io/node/viem`; `wallet/react/index.ts:5` eagerly value-re-exports `DynamicWallet` which statically imports `react/.../dynamic/utils/createSigner.ts` value-importing `@dynamic-labs/ethereum`. Because `index.node.ts` does `export * from '@/wallet/node/index.js'` (and `index.react.ts` likewise), merely importing the SDK root pulls `@privy-io/node` (node entry) and `@dynamic-labs/ethereum` (react entry) into the static module graph even for a consumer who only uses Turnkey or LocalWallet. The registry's `import()` is then moot for these two vendors. This is the same root mechanism as F149 but sharpened: the lazy-loading contract is silently inconsistent across the three vendors (works for Turnkey, broken for Privy node + Dynamic react), which is also why the F140 barrel-export asymmetry exists.
- **Exploit/repro:** grep value-imports: `wallet/node/wallets/hosted/privy/utils/createSigner.ts:1` imports `createViemAccount` from `@privy-io/node/viem`; reached statically from `wallet/node/index.ts:6` (PrivyWallet), which `index.node.ts` re-exports via `export *`. Same for `DynamicWallet -> @dynamic-labs/ethereum` in the react entry. Turnkey: grep shows `TurnkeyWallet`/`TurnkeyHostedWalletProvider` absent from all barrels.
- **Recommendation:** Stop value-re-exporting `PrivyHostedWalletProvider`/`PrivyWallet` (node) and `DynamicWallet` (react) from the wallet barrels; route ALL three vendors exclusively through the registry's lazy `import()` (as Turnkey already is), or convert the barrel re-exports to `export type`-only. Add a build/bundle test asserting that importing the root node/react entry does NOT pull `@privy-io/node` or `@dynamic-labs/ethereum` into the static graph.
- **suggestRefactor:** true
- **Candidate issue:** #131
- **Relates to prior finding:** F149
- **Dedup status:** refines:F149

### (dup:F149) — no peerDependenciesMeta.optional for any of the 10 vendor wallet SDKs
- **Surface:** wallet-hosted
- **File:** packages/sdk/package.json (peerDependencies block, no sibling peerDependenciesMeta)
- **Severity:** medium
- **Class:** infra
- **Title:** No `peerDependenciesMeta.optional` for any of the 10 vendor wallet SDKs, so an integrator using one provider must install all ten
- **Detail:** This restates the manifest half of F149 (which already names "all 10 hosted-wallet vendor SDKs are hard peerDependencies with no peerDependenciesMeta.optional"). `package.json` declares 10 hosted-wallet vendor SDKs as peerDependencies with no `peerDependenciesMeta` block marking any optional, so package managers that honor peer constraints treat every one as required and warn/hard-fail on a single-vendor tree. The concrete, independently-actionable manifest fix (add `peerDependenciesMeta.optional`) is already the documented F149 remediation. Recorded as a dup against F149 rather than a new row.
- **Exploit/repro:** `grep -n 'peerDependenciesMeta\|optional' packages/sdk/package.json` returns nothing; all 10 peers are mandatory.
- **Recommendation:** Track under F149/#131: add a `peerDependenciesMeta` block marking all 10 vendor SDKs `{ optional: true }`, paired with the barrel-export fix (refines:F149 above) so a real one-provider install resolves and builds.
- **suggestRefactor:** false
- **Candidate issue:** #131
- **Relates to prior finding:** F149
- **Dedup status:** dup:F149

### (dup:F166) — autoInstallPeers:true masks the missing-optional-peer failure in-repo and silently auto-installs all ten signing-path vendor SDKs
- **Surface:** wallet-hosted
- **File:** pnpm-workspace.yaml (settings.autoInstallPeers; pnpm-lock.yaml: autoInstallPeers: true)
- **Severity:** low
- **Class:** info
- **Title:** `autoInstallPeers:true` masks the missing-optional-peer failure in-repo and silently auto-installs all ten signing-path vendor SDKs
- **Detail:** Same root fact as F166 (filed first on the wallet-core surface): the workspace resolves with `autoInstallPeers: true`, which combined with the 10 non-optional vendor peers means a `pnpm install` silently auto-installs every hosted-wallet vendor SDK regardless of which is used, and never surfaces the unmet-peer condition that downstream integrators on npm/yarn (or pnpm without the flag) will hit. The supply-chain consequence (repo CI hides the #131 "builds without all deps" regression; the workspace carries the full transitive closure of all ten signing-key SDKs) is identical to F166. Recorded as a dup of F166, not a separate row.
- **Exploit/repro:** `grep -m1 autoInstallPeers pnpm-lock.yaml` → `autoInstallPeers: true`; `grep -rln 'pnpm audit\|npm audit\|audit-ci\|snyk' .github/` → no dependency-audit CI gate.
- **Recommendation:** After adding `peerDependenciesMeta.optional` and de-eagering the barrels, add a CI job that installs the published tarball with only one vendor SDK present (autoInstallPeers off) to prove the #131 invariant. Track under F166/F167.
- **suggestRefactor:** false
- **Candidate issue:** #131
- **Relates to prior finding:** F149
- **Dedup status:** dup:F166

---

## Surface: wallet-smart

### F170 (NEW) — viem is a plain (non-peer) dependency with a floating ^2.24.1 range, yet the smart-wallet's deterministic address and UserOp callData are fully delegated to viem account-abstraction internals
- **Surface:** wallet-smart
- **File:** packages/sdk/package.json:67
- **Severity:** medium
- **Class:** infra
- **Title:** `viem` is a plain (non-peer) dependency with a floating `^2.24.1` range, yet the smart-wallet's deterministic address and UserOp callData are fully delegated to viem account-abstraction internals
- **Detail:** The `DefaultSmartWallet` surface delegates two funds-safety-critical primitives entirely to viem: (1) the CREATE2 deterministic wallet address is derived inside viem via `toCoinbaseSmartAccount({version:'1.1', owners, nonce})` and the factory `getAddress` read (DefaultSmartWallet.ts:196-207,573-587), and (2) the signing-path UserOperation callData/initCode are produced by viem's `bundlerClient.prepareUserOperation` and then suffix-appended (DefaultSmartWallet.ts:224-236,268-281). viem is declared ONLY under `dependencies` (packages/sdk/package.json:67) as `^2.24.1`, NOT as a peerDependency. In this monorepo the root `pnpm.overrides` force-pins viem to exactly 2.33.0 (root package.json:53), so local builds and the lockfile are deterministic. But the PUBLISHED package carries `viem: ^2.24.1` with no override, so an integrator resolves any viem `>=2.24.1 <3.0.0`, AND gets a second copy of viem nested under the SDK distinct from their own app-level viem. Two consequences on the signing path: (a) account-abstraction type/class identity (the `toCoinbaseSmartAccount` account object, `WaitForUserOperationReceiptReturnType`) does not match across the SDK-vs-app viem boundary, breaking `instanceof`/receipt-shape assumptions; (b) any minor viem release that adjusts the Coinbase '1.1' smart-account init-code derivation silently changes the deterministic (undeployed) wallet address the integrator computes vs. what the SDK computed — funds could be sent to a stale/divergent address. This surface imports nothing heavy (viem-only; no ethers/permissionless/@aave/@morpho at runtime, confirmed by grep), so the fix is narrow: the encoding/signing dependency that matters here is viem alone.
- **Exploit/repro:** Publish the SDK with viem `^2.24.1`; the integrator app pins viem to a different 2.x; the SDK-computed undeployed wallet address (via nested viem) and the app-side recompute (via app viem) diverge if any in-range viem changed the '1.1' init-code path → a deposit is sent to an address whose code is never deployed by the SDK's account object.
- **Recommendation:** Promote viem to a peerDependency (plus a dev `devDependency` for the SDK's own build) so the integrator's single viem instance is shared and account-abstraction type identity holds across the boundary. Tighten the published range to a minor-pinned floor known to keep `toCoinbaseSmartAccount('1.1')` address derivation stable (e.g. `>=2.33.0 <2.34.0`) rather than the wide `^2.24.1`. Document that the deterministic address is viem-version-sensitive. Flag only — do not change.
- **suggestRefactor:** true
- **Candidate issue:** #131
- **Relates to prior finding:** F149
- **Dedup status:** new

### F171 (NEW) — no regression test pins the deterministic CREATE2 wallet address to a known-good constant across a viem upgrade
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:81,95,124
- **Severity:** medium
- **Class:** correctness
- **Title:** No regression test pins the deterministic CREATE2 wallet address to a known-good constant across a viem upgrade; the `version:'1.1'` arg is asserted but the resulting funds-receiving address is not
- **Detail:** The deterministic smart-wallet address is the address users deposit funds to before deployment (`getAddress()` at DefaultSmartWallet.ts:573-587 reads the factory; `getCoinbaseSmartAccount` passes `version:'1.1'` at DefaultSmartWallet.ts:205). The test suite asserts that `toCoinbaseSmartAccount` was CALLED with `version:'1.1'` (spec line 124) and that the address equals a mocked `deploymentAddress`/mocked factory return (spec lines 81, 95) — both test-supplied mocks, not a real viem-computed value. There is therefore NO test that locks the actual CREATE2-derived address (for a fixed owner-set + nonce) to a known constant. Because address derivation is delegated to viem's account-abstraction module, a viem bump within the floating `^2.24.1` range (F170) that alters the '1.1' Coinbase init-code derivation would silently relocate every undeployed wallet's address while the suite stays green. For a wallet SDK this is the single highest-value supply-chain regression guard and it is absent.
- **Exploit/repro:** Bump viem to a future in-range version that changes '1.1' init-code; the current suite passes; deposits to the recomputed address land on an address the SDK no longer controls/deploys.
- **Recommendation:** Add a golden-vector test: for a fixed `(owners, nonce)` tuple, assert the real viem-derived deterministic address equals a hardcoded known-good address (no mocking of `toCoinbaseSmartAccount`/factory). This turns a silent viem-upgrade address shift into a red test. Also assert the factory address constant `smartWalletFactoryAddress` (constants/index.ts:1) is unchanged. Flag only.
- **suggestRefactor:** false
- **Candidate issue:** #131
- **Relates to prior finding:** none
- **Dedup status:** new

### F172 (NEW) — hardcoded vendored Coinbase smart-wallet factory address + full ABI are an unverified third-party artifact with no provenance pin or integrity check
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/default/constants/index.ts:1-482
- **Severity:** low
- **Class:** info
- **Title:** Hardcoded vendored Coinbase smart-wallet factory address + full ABI are an unverified third-party (supply-chain) artifact with no provenance pin or integrity check
- **Detail:** `smartWalletFactoryAddress` (`0xBA5ED110...85842`) and the complete `smartWalletAbi`/`smartWalletFactoryAbi` are vendored verbatim from Coinbase's smart-wallet contracts (DefaultSmartWallet.ts JSDoc cites coinbase/smart-wallet). This is effectively a copy-paste supply-chain dependency: the address is the trust root for `createAccount`/`getAddress` (deterministic address + deployment, DefaultSmartWallet.ts:472-485,580-585) and `addOwner`/`removeOwner` signing-path encodings. It is a single shared constant across all chains (assumed identical deployment on every supported chain). There is no comment recording the upstream commit/version it was generated from, no test asserting the address matches the canonical Coinbase factory on each supported chain, and no checksum/provenance note. A wrong or drifted ABI entry (e.g. `removeOwnerAtIndex` argument order) would mis-encode an owner-management UserOp; a wrong factory address would derive/deploy to an attacker-influenceable address. This is provenance hygiene, not a live bug — flag as info per the dependency-auditor provenance lens.
- **Exploit/repro:** No source-of-truth comment or per-chain integrity test exists for `smartWalletFactoryAddress`/`smartWalletAbi`; a drifted ABI entry or address constant would not be caught.
- **Recommendation:** Add a source-of-truth comment (upstream repo + commit/tag the ABI+address were generated from) atop constants/index.ts, and a per-chain test asserting bytecode/known-deployment exists at `smartWalletFactoryAddress` on each `SupportedChainId` (or document the cross-chain-identical assumption). Flag only.
- **suggestRefactor:** false
- **Candidate issue:** #90
- **Relates to prior finding:** none
- **Dedup status:** new

### (refines:F146) — public deploy-path error type leaks viem's WaitForUserOperationReceiptReturnType, hard-coupling a published error class to a floating vendor internal type
- **Surface:** wallet-smart
- **File:** packages/sdk/src/wallet/core/wallets/smart/error/errors.ts:1,5
- **Severity:** low
- **Class:** infra
- **Title:** The public deploy-path error type leaks viem's `WaitForUserOperationReceiptReturnType`, hard-coupling a published error class to a floating vendor internal type
- **Detail:** `SmartWalletDeploymentError` (errors.ts:5-18) and the abstract `SmartWallet` send/sendBatch/deploy contracts (abstract/SmartWallet.ts:2,26,38) expose viem's `WaitForUserOperationReceiptReturnType` directly in public-facing signatures and on the `receipt` field of a publicly-thrown error. Because viem floats at `^2.24.1` (F170) and is not a peer, this published type identity is pinned to whatever viem the SDK happens to nest, and can drift from the integrator's viem — the consumer cannot reliably narrow `receipt` across the boundary. This is the supply-chain / coupling angle on the same surface flagged structurally by F142/F143/F146; recording here because the demotion-to-peer fix (F170) is what actually closes the type-identity divergence, not just an export tweak. Refines F146 (which already names the viem `WaitForUserOperationReceiptReturnType` leak) with the floating-version coupling consequence.
- **Exploit/repro:** `SmartWalletDeploymentError.receipt` is typed `WaitForUserOperationReceiptReturnType`; with viem nested at a different version than the app's, the type identity does not match and the consumer cannot narrow the receipt.
- **Recommendation:** As part of promoting viem to a peerDependency (F170), treat the leaked account-abstraction return types as part of the public contract that must come from the shared viem instance; consider re-exporting a stable SDK-owned receipt alias rather than the raw vendor type. Flag only.
- **suggestRefactor:** true
- **Candidate issue:** #476
- **Relates to prior finding:** F146
- **Dedup status:** refines:F146

---

## Surface: core-services

### F173 (NEW) — @morpho-org/morpho-ts declared as a direct runtime dependency but has zero source imports (dependency bloat)
- **Surface:** core-services
- **File:** packages/sdk/package.json:64
- **Severity:** low
- **Class:** info
- **Title:** `@morpho-org/morpho-ts` declared as a direct runtime dependency but has zero source imports (dependency bloat / unnecessary supply-chain surface)
- **Detail:** `package.json` line 64 lists `@morpho-org/morpho-ts: ^2.4.1` as a direct `dependencies` entry. A full-tree grep of `packages/sdk/src` finds zero value or type imports of `@morpho-org/morpho-ts`; the only reference is a `vi.mock('@morpho-org/morpho-ts', ...)` stub in `actions/lend/providers/morpho/__tests__/MorphoLendProvider.test.ts:25` (test scaffolding, not shipped code). The lockfile further shows `morpho-ts` is already a peer/transitive dependency of `@morpho-org/blue-sdk` (4.13.1) and `@morpho-org/blue-sdk-viem` (3.2.0), so it resolves for the SDK regardless. A declared-but-unused direct dependency on a heavy protocol-adjacent package needlessly expands the SDK's first-order supply-chain attack surface (every consumer installs and trusts it at the top level) and the published manifest misrepresents the SDK's real runtime needs. Distinct from F149/#131 (peer eager-load) and F125/F140 (export asymmetry).
- **Exploit/repro:** `grep -rn '@morpho-org/morpho-ts' packages/sdk/src` returns only the `vi.mock` test stub; no value/type import in shipped code.
- **Recommendation:** Remove `@morpho-org/morpho-ts` from the SDK's direct `dependencies`; if any transitive type resolution actually needs it pinned, rely on the blue-sdk transitive or move it to `devDependencies` for the test mock. Add a CI guard (e.g. depcheck / knip) to catch declared-but-unused direct dependencies, since the SDK already sets `sideEffects:false` and aims for tree-shakeability (#283).
- **suggestRefactor:** true
- **Candidate issue:** none
- **Relates to prior finding:** none
- **Dedup status:** new

### F174 (NEW) — @morpho-org/blue-sdk heavy protocol SDK types leak into the public barrel via the types/index export-* chain
- **Surface:** core-services
- **File:** packages/sdk/src/types/lend/morpho.ts:6-17
- **Severity:** low
- **Class:** info
- **Title:** `@morpho-org/blue-sdk` heavy protocol-SDK types leak into the SDK's public barrel via the `types/index` `export-*` chain, making it a non-demotable hard type-resolution dependency for every consumer
- **Detail:** `types/lend/morpho.ts` re-exports `AccrualVault`/`IAccrualVault`/`IVault`/`Vault`/`IVaultMarketAllocation`/`VaultMarketAllocation` from `@morpho-org/blue-sdk` (lines 6-17, type-only). This file is pulled into the public surface through an unbroken `export *` chain: `index.ts:156 export * from '@/types/index.js' -> types/index.ts export * from '@/types/lend/index.js' -> types/lend/index.ts:2 export * from '@/types/lend/morpho.js'`. The pass directive asks which heavy protocol SDKs (@morpho-org/*) are materially needed vs demotable: because these blue-sdk types are part of the published `.d.ts` public API, `@morpho-org/blue-sdk` cannot be demoted to a dev-only differential oracle without a breaking change, and every consumer (including swap-only or EOA-only integrators who never touch Morpho lending) must have `@morpho-org/blue-sdk` installed for their own typecheck to resolve the SDK's types. The re-export is type-only so there is no runtime cost, but it couples the SDK's public type contract to a fast-moving third-party protocol SDK's internal type names. Distinct from F125 (AaveLendProvider drop) and F140 (hosted export asymmetry).
- **Exploit/repro:** `types/lend/morpho.ts:6-17` re-exports blue-sdk types; the `export *` chain from `index.ts:156` makes them public `.d.ts` surface, so a consumer's typecheck requires `@morpho-org/blue-sdk` installed even for non-Morpho usage.
- **Recommendation:** Define SDK-owned narrow public types (e.g. a `MorphoVaultInfo` shape) for the lend return surface instead of re-exporting blue-sdk's internal interfaces, so `@morpho-org/blue-sdk` becomes an internal-only dependency that could be demoted/swapped without a public-API break. At minimum, stop `export *`-ing the raw blue-sdk type names through the package root.
- **suggestRefactor:** true
- **Candidate issue:** #209
- **Relates to prior finding:** none
- **Dedup status:** new

### F175 (NEW) — permissionless (account-abstraction SDK) value-imports in ChainManager are eagerly loaded via the always-imported actions.ts path for every consumer
- **Surface:** core-services
- **File:** packages/sdk/src/services/ChainManager.ts:2-4
- **Severity:** low
- **Class:** info
- **Title:** `permissionless` (account-abstraction SDK) value-imports in ChainManager are eagerly loaded via the always-imported `actions.ts` path for every consumer, including EOA-only integrators who never use smart wallets
- **Detail:** `ChainManager.ts` statically value-imports `createSmartAccountClient` from `permissionless/clients` (line 3) and `createPimlicoClient` from `permissionless/clients/pimlico` (line 4); used at lines 250 and 258 to build the bundler/smart-account signing clients. `ChainManager` is statically imported and instantiated unconditionally by `actions.ts` (line 10 import, line 83 `new ChainManager(config.chains)`), which is the `createActions` entry every SDK consumer loads. Therefore the entire `permissionless` AA stack (and its viem-account-abstraction surface) is eagerly pulled into the module graph for every integrator, even pure-EOA or read-only ones who never construct a smart wallet. `permissionless` IS materially needed at runtime for the smart-wallet/bundler path, so it correctly belongs in `dependencies` (not demotable), but its eager top-level binding defeats the lazy-loading goal in the same family as F149/#131 (the hosted-wallet eager value-imports). Reported as info, in scope as a runtime-classification observation for this surface.
- **Exploit/repro:** `actions.ts:10` statically imports `ChainManager` and `:83` instantiates it unconditionally; `ChainManager.ts:3-4` statically value-imports `permissionless/clients` and `permissionless/clients/pimlico`, so the AA stack loads for every consumer including EOA-only.
- **Recommendation:** Defer the permissionless client construction behind a lazy `await import('permissionless/clients')` inside `getSmartAccountClient`/`getPimlicoBundlerClient` so the AA stack only loads when a smart wallet is actually used, keeping the EOA-only path free of the permissionless graph. Track alongside #131 / F149's lazy-loading remediation.
- **suggestRefactor:** true
- **Candidate issue:** #131
- **Relates to prior finding:** F149
- **Dedup status:** new

### F176 (NEW) — all SDK runtime dependencies use floating ^/>= ranges with no published lockfile and no peerDependenciesMeta.optional; supply-chain pinning rests entirely on the consumer-side root pnpm.overrides
- **Surface:** core-services
- **File:** packages/sdk/package.json:58-80
- **Severity:** low
- **Class:** infra
- **Title:** All SDK runtime dependencies use floating `^`/`>=` ranges with no published lockfile and no `peerDependenciesMeta.optional`; supply-chain pinning rests entirely on the consumer-side root `pnpm.overrides` (with the `pnpm audit` vs Wiz #432 reconciliation)
- **Detail:** Every entry in the SDK's `dependencies` (lines 58-68) uses a caret range and every one of the 10 hosted-wallet `peerDependencies` (lines 70-79) uses an open `>=` minimum with no upper bound and no `peerDependenciesMeta` block (confirmed absent). For a published SDK that sits on the signing path (viem/permissionless/ethers do EIP-712, calldata encoding, and AA UserOp signing), open-ended `>=` ranges mean a consumer can silently resolve a much newer major of a vendor wallet SDK or a new viem minor than the SDK was tested against, with no compile-time or install-time gate. The only thing currently collapsing viem version drift is the monorepo ROOT `package.json` `pnpm.overrides` pinning `viem: 2.33.0` plus `peerDependencyRules.allowedVersions` — a developer-side mitigation that does NOT travel with the published package, so external integrators get the unpinned `^2.24.1` behavior. The lockfile (pnpm-lock.yaml, lockfileVersion 9.0) has integrity hashes (1725 entries) but is the workspace lockfile, not shipped to consumers. **Reconciliation with Wiz #432:** a full `pnpm audit` reports 74 high + 1 critical advisories, but the critical is `vitest` (devDependency, test-only) and every high/critical resolves under `packages/demo/frontend > ...` paths (Dynamic/WalletConnect/MetaMask transitive trees) or devDeps — NONE land on a `packages/sdk` runtime dependency path, so the SDK's shipped runtime tree is currently clean of known CVEs. This is the manifest-wide umbrella over F165 (viem float), F169 (unbounded peers), F167 (no CI audit), and F149 (optional peers).
- **Exploit/repro:** Inspect `package.json:58-80`: all `dependencies` carets, all 10 peers `>=`, no `peerDependenciesMeta`; the root `pnpm.overrides viem 2.33.0` is in the workspace root manifest only, absent from the published package; `pnpm audit` high/critical paths all resolve under `packages/demo/frontend` or devDeps.
- **Recommendation:** For the publishable SDK, narrow the `>=` peer ranges to bounded ranges (e.g. `>=4.31.4 <5`) and add `peerDependenciesMeta` marking the 10 hosted-wallet SDKs `optional:true` (also the F149/#131 fix), so integrators are not forced to install all 10 vendors and cannot silently float to an untested major. Document that the consumer is responsible for pinning viem to match the SDK's tested 2.33.0. Keep tracking the demo-frontend high/critical advisories under #432; they are out of the SDK runtime path but in the same repo.
- **suggestRefactor:** false
- **Candidate issue:** #432
- **Relates to prior finding:** F149
- **Dedup status:** new

### (dup:F161) — ethers v5.8.0 (EOL/maintenance) is a runtime dependency and both ethers v5 and v6 coexist in the tree
- **Surface:** core-services / wallet-core
- **File:** packages/sdk/package.json:63 (and pnpm-lock.yaml dual-ethers entries)
- **Severity:** low
- **Class:** info
- **Title:** ethers v5.8.0 (EOL/maintenance) is a runtime dependency and both ethers v5 and v6 coexist in the tree; inflates the audited signing-adjacent surface
- **Detail:** Same lockfile fact as F161 (filed first on the lend surface): `package.json` lists `ethers: ^5.7.2` (resolved 5.8.0), ethers v5 is in EOL/maintenance, and the lockfile carries BOTH ethers@5.8.0 (pulled by @aave/contract-helpers) and ethers@6.16.0 (pulled by @turnkey/core). The wallet-core and core-services framing adds the EOL note and that ethers is only needed by the @aave lend read path — but the underlying "two ethers majors / ethers@5 is heavyweight and demotable" observation is F161 plus F156 (the ethers@5 demotion). Recorded as a dup of F161, not a separate row.
- **Exploit/repro:** Lockfile resolves ethers `5.8.0` and `6.16.0`; `package.json:63` declares `ethers: ^5.7.2`; the sole runtime value import is `aave/sdk.ts`.
- **Recommendation:** Track ethers v5 EOL status; scope/lazy-load ethers to the Aave provider (F156) so wallet-core/swap consumers do not pull it, and dedupe the v5/v6 split. Reconcile with #432. Info only.
- **suggestRefactor:** false
- **Candidate issue:** #432
- **Relates to prior finding:** F161
- **Dedup status:** dup:F161

### (dup:F156) — ethers (ethers v5, full runtime dependency) ships alongside viem with a single SDK-wide value import — demotable to a thin internal adapter
- **Surface:** core-services
- **File:** packages/sdk/package.json:65 (import site: actions/lend/providers/aave/sdk.ts:3)
- **Severity:** low
- **Class:** info
- **Title:** ethers (v5, full runtime dependency) ships alongside viem with a single SDK-wide value import — demotable to a thin internal adapter and a runtime-vs-dev classification candidate
- **Detail:** Same demotion observation as F156 (filed first on the lend surface), framed from core packaging: `package.json` declares `ethers: ^5.7.2` (resolved 5.8.0) as a runtime dep, and a full-tree grep finds exactly ONE value import across the SDK — `actions/lend/providers/aave/sdk.ts:3 import { providers } from 'ethers'` for a read-only `JsonRpcProvider`. Carrying a whole second web3 library for one provider construction is the same cost F156 names; the recommendation (replace with a viem-backed adapter or demote, reconcile with #211) is identical. Recorded as a dup of F156.
- **Exploit/repro:** `grep -rn "from 'ethers'" packages/sdk/src` → one hit, `aave/sdk.ts:3`.
- **Recommendation:** Assess replacing the single `ethers.providers` usage in `aave/sdk.ts` with a viem-backed adapter so `ethers` can be dropped from runtime `dependencies` (F156), or pin it and document why a second web3 lib is required. Reconcile with #211. Flag, do not fix.
- **suggestRefactor:** true
- **Candidate issue:** #211
- **Relates to prior finding:** F156
- **Dedup status:** dup:F156

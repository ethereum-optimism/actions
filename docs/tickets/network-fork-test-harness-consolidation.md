# Consolidate the Anvil fork-test harness and land the PR #348 fixes

> **AUGMENT existing issue #332 / #348 / #335 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as IMPORTANT to work during implementation.**

| | |
|---|---|
| **Severity** | medium |
| **Complexity** | 4 (1-5) |
| **Domain** | testing |
| **Surface** | shared Anvil harness `packages/sdk/src/utils/test.ts`; the two divergent fork tests (Velodrome swap, Morpho borrow); PR #348 `src/test/network` foundation + its required fixes |
| **Resolves findings** | F177, F188, F200, F210, F223, F230, F241, F254 (and the harness-defect slices F194, F195, F216, F249, F250 they consolidate) |
| **Candidate existing issue** | #332 / #348 / #335 |
| **Blocked by** | (none) |
| **Blocks** | `e2e-anvil-feature-test` |

## Problem

This is a **fund-safety coverage** ticket. Every fund-moving primitive in the SDK ships with a test suite that **cannot fail when the underlying fund-loss or malicious-sign mechanic is present**, and the one piece of on-chain test infrastructure that could fix that - the shared Anvil fork harness - is itself unusable as a foundation for a real broadcast-and-assert end-to-end test. Two fork tests exist repo-wide; both are read/quote-only, each carries its own divergent inline `createForkChainManager` cast to `as unknown as ChainManager`, and they sit on a `startAnvilFork`/`fundWallet` harness that hard-codes ports, hard-codes a single off-chain whale, and swallows funding failures.

The fund-safety consequence is concrete: the consolidated end-to-end feature-test (`e2e-anvil-feature-test`) that would make the swap-recipient (V4 `TAKE_ALL` / universal sentinel, #444/F046/F003), residual-Permit2-allowance, stale-quote, and stale-owner-set mechanics observable **cannot be built on the harness as it stands**. A new lend leg needs a fourth free port the manual registry cannot guarantee, needs USDC funding the Unichain-only whale table cannot supply on an OP fork, and would silently pass with a zero balance because funding failures `console.log`-and-continue. Until the harness is one consolidated foundation that allocates ephemeral ports, validates the fork `chainId`, funds per-chain, and **fails loud** on a funding miss, the capstone end-to-end test is dead-on-arrival or false-green.

PR #348 already introduces a `src/test/network` harness as the intended single foundation; this ticket adopts it, migrates the two pre-existing divergent fork tests onto it, and lands the required fixes flagged on that PR. It is pure test/harness work: no production-path code changes.

## Findings

Each locus is a **test-file / harness defect**, distinct from the logic bugs it relates to (the logic fixes are owned by their own tickets; this harness work makes those fixes verifiable).

- **F177** (high, correctness) - `packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:262-291` - the only on-chain `execute` fork test asserts the encoder against itself (`tx.transactionData.swap.data === quote.execution.swapCalldata`, `:288`) and never broadcasts, so no swap test proves output lands at the recipient; F046/F003/F047 are un-falsifiable.
- **F188** (medium, info) - `…/VelodromeSwapProvider.network.test.ts:1-293` - consolidated end-to-end spec (swap slice): the swap fork coverage this harness must carry; folds into the `e2e-anvil-feature-test` capstone, but the harness fixes here are its precondition.
- **F200** (low, info) - `docs/reviews/review-pass-09.md` (lend slice) - consolidated end-to-end spec (lend slice): lend has **no** fork test today, so the lend leg is the surface that most needs a fourth ephemeral port + working per-chain USDC funding the current harness cannot provide.
- **F210** (medium, malicious-sign) - `packages/sdk/src/actions/borrow/namespaces/WalletBorrowNamespace.ts:207-247` - borrow end-to-end spec slice (recipient-in-bytes, residual `maxUint256` allowance, quote-aging via Anvil time-travel); requires a fork harness that broadcasts and can advance time, neither of which the read-only borrow fork test exercises.
- **F223** (medium, info) - `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294` - consolidated end-to-end spec (wallet-core slice): real signed `send`/`sendBatch` through `EOAWallet` and `DefaultSmartWallet`; zero network coverage of any signing path exists today.
- **F230** (low, info) - `packages/sdk/src/wallet/node/wallets/hosted/privy/PrivyWallet.ts:22,36,48-50` - consolidated end-to-end spec (wallet-hosted slice): real-credential signer-identity + Permit2 `verifyTypedData`; needs the harness to drive a real signing client, not the `as unknown as ChainManager` fake.
- **F241** (high, correctness) - `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:196-294,310-422,456-500` - consolidated end-to-end spec (smart-wallet slice): 4337 deploy + execute + owner-rotation on a real bundler/Anvil; the long-pole leg that depends on a stable, single fork harness.
- **F254** (low, infra) - `packages/sdk/src/utils/test.ts:1-438` - consolidated end-to-end Anvil spec (core-services synthesis): names the shared harness as the thing to fix - ephemeral ports, `chainId`-validated readiness, per-chain whale map, throw-on-funding-failure - building on PR #348 with its required fixes.

The five harness-defect slices these consolidate, at exact line:line:

- **F194 / F250** (medium, infra) - `packages/sdk/src/utils/test.ts:74-105` - `startAnvilFork` takes caller-supplied **fixed** ports; the swap suite grabs `18545`/`18546` (`…network.test.ts:97-98`) and the borrow suite grabs `18547` (`…MorphoBorrowProvider.network.test.ts:161`). Disjoint today only by manual bookkeeping; the network vitest project sets no `fileParallelism:false`, so a third (lend) suite collides with `EADDRINUSE`. The readiness probe returns ready on `res.ok` (`test.ts:97`) - any HTTP 200, including a JSON-RPC error body or an unforked node - and never validates `eth_chainId` against the configured fork chain (a wrong-chain signing hazard).
- **F195 / F249** (medium→high, infra) - `packages/sdk/src/utils/test.ts:323-392` - `fundWallet` hard-codes a single Unichain whale `0x5752…C792` (`:331`) and a single Unichain USDC `0x078d…7ad6` (`:341`), wraps the impersonation transfer in `try/catch` that on failure only `console.log`s and returns normally (`:386-390`), and computes `BigInt(parseFloat(usdcAmount) * 1e6)` (`:351`) - a JS-float truncation that breaks for large/high-precision amounts - with the funder client cast `as any` (`:311`,`:336`). On any non-Unichain fork the transfer reverts, is swallowed, and the test proceeds with zero USDC (dead-on-arrival / false-green).
- **F216** (medium, infra) - `packages/sdk/src/utils/test.ts:74-105,116-438` - the wallet-core framing of the same two harness blockers (fixed ports + Unichain-only funding) that block any signing end-to-end test.

## Root cause

The two network fork tests were written independently, before any shared fork-harness convention existed, so each grew its **own** inline `createForkChainManager` (Velodrome `…network.test.ts:64-72`, Morpho `…MorphoBorrowProvider.network.test.ts:104-115`), both terminating in `} as unknown as ChainManager` - a fake that satisfies the type checker while bypassing the real client wiring the signing path uses. The shared `test.ts` helpers were built for a single early Unichain scenario: a hand-picked port, one whale, one USDC address, and a permissive `res.ok` readiness check, with funding failures downgraded to a log so the original suite would not hard-fail in CI without the whale. None of that was revisited as the swap and borrow suites multiplied, and lend never got a fork test at all, so the harness was never stressed by a second or third concurrent fork or a non-Unichain chain. PR #348 introduces the consolidated `src/test/network` harness that fixes the shape; the required-fix set on that PR is exactly the divergence-and-fragility list above.

## Recommended approach

All changes are test/harness-side: the shared SDK test utilities and the two fork test files. No production-path code is touched. This stays inside the SDK fix space (missing-obvious-validation and sibling consistency in the **test harness**); it does not change signing behavior, does not guess intent, and does not harden against a hostile RPC (a documented assumption - the harness pins a fork block and validates `chainId`, nothing more).

1. **Adopt the PR #348 `src/test/network` harness as the single foundation.** Land that PR's harness and route all fork tests through it. Delete the bespoke `startAnvilFork`/`fundWallet` shape in `utils/test.ts` (or re-export the consolidated helpers from there for back-compat) so there is exactly one fork-harness entry point.

2. **Migrate the two divergent fork tests off the `as unknown as ChainManager` fake (F177-context, F206-context).** Remove the per-file inline `createForkChainManager` from `VelodromeSwapProvider.network.test.ts:64-72` and `MorphoBorrowProvider.network.test.ts:104-115` and have both consume the single harness `createForkChainManager` helper that builds a **real** `ChainManager` bound to the fork RPC. One helper, one chain-wiring path.

3. **Ephemeral ports + `chainId`-validated readiness (F194/F250).** `startAnvilFork` allocates an OS-assigned free port (`--port 0` / probe) and returns the bound port; no fixed `18545`-`18547` literals anywhere. The readiness probe parses the JSON-RPC response, requires a numeric `result`, and asserts `eth_chainId ===` the expected fork chain. Add a harness-level assertion that the fork's `chainId` equals the `ChainManager` chain the wallet uses.

4. **Per-chain whale map + fail-loud funding (F195/F249).** `fundWallet` looks the USDC address and whale up from a per-`chainId` table (OP-first, not the single Unichain pair), **throws** (not `console.log`-and-continue) when a requested USDC transfer fails, replaces `BigInt(parseFloat(amount) * 1e6)` with `parseUnits(amount, 6)`, and drops the `as any` casts on the funder client. The harness asserts `balanceOf == requested` after funding, before any test body runs.

5. **Land the remaining PR #348 required fixes.** Remove the **dead-on-arrival lend tests** introduced in #348 that were built against an Aave provider constructed with an **empty `marketAllowlist`** (the provider resolves no market, so the test can never exercise a real supply) - rebuild them against a populated allowlist on the consolidated harness. Remove the **string-coercion no-op assertion** flagged on #348 (an assertion that coerces both sides to a string so it can never fail). Make namespace **execution OP-only** rather than spread across mismatched chains, matching the per-chain whale table.

6. **Keep the divergent harnesses where intentional, unify where accidental.** Provider-read and namespace-execution may remain as two harnesses with minimal overlap; what gets unified is the **single `createForkChainManager` + single `startAnvilFork`/`fundWallet`**, not the test bodies.

This ticket does **not** author the broadcast-and-assert end-to-end test bodies (recipient-in-bytes decode, residual-allowance, quote-aging) - those land in the `e2e-anvil-feature-test` capstone that depends on this harness. The Permit2 `PermitTransferFrom` signature payload the capstone signs through each hosted provider is in signing-path scope, but the signing itself is the capstone's; this ticket only makes the harness able to drive it.

## Affected files

Test / harness loci (the fix lands here, not in any production source line):

- `packages/sdk/src/utils/test.ts:74-105` - `startAnvilFork`: ephemeral port allocation + `eth_chainId`-validated readiness, replacing the `res.ok` check at `:97`.
- `packages/sdk/src/utils/test.ts:323-392` - `fundWallet`: per-chain `{usdc, whale}` map (replacing the Unichain `0x5752…C792` whale at `:331` and `0x078d…7ad6` USDC at `:341`), throw-on-failure (replacing the swallowed `catch` at `:386-390`), `parseUnits(amount, 6)` (replacing `:351`), drop `as any` (`:311`,`:336`).
- `packages/sdk/src/test/network/**` - the PR #348 consolidated harness adopted as the single foundation (new directory landed by #348).
- `packages/sdk/src/actions/swap/providers/velodrome/__tests__/VelodromeSwapProvider.network.test.ts:64-72,97-98,288` - delete the inline `createForkChainManager`, consume the shared real `ChainManager`, drop fixed ports.
- `packages/sdk/src/actions/borrow/providers/morpho/__tests__/MorphoBorrowProvider.network.test.ts:104-115,161` - delete the inline `createForkChainManager`, consume the shared real `ChainManager`, drop the fixed `18547`.
- The PR #348 lend network test - rebuild off the empty-`marketAllowlist` Aave construction onto a populated allowlist; remove the string-coercion no-op assertion; make execution OP-only.

## Acceptance criteria / tests

- There is exactly **one** fork-harness entry point (`startAnvilFork`/`fundWallet`/`createForkChainManager`); `grep -rn "as unknown as ChainManager" packages/sdk/src/**/*.network.test.ts` returns **zero** matches, and neither fork test defines its own `createForkChainManager`.
- No fixed Anvil port literal (`18545`-`18547`) remains in any test or harness file; `startAnvilFork` returns the OS-assigned bound port, and running the full network project under default vitest parallelism produces no `EADDRINUSE` / `did not start in time` flake across repeated CI runs.
- The readiness probe asserts a numeric JSON-RPC `result` and `eth_chainId === expectedForkChainId`; a deliberately wrong fork URL (or an unforked node) fails readiness loudly instead of declaring ready on a bare HTTP 200.
- `fundWallet` resolves USDC + whale per `chainId`, funds correctly on an **OP** fork, and **throws** when a requested USDC transfer fails (a regression test funds against a chain with no whale entry and asserts the call throws, not logs); post-funding `balanceOf == requested` is asserted before any body runs; `parseUnits` replaces the `parseFloat(...)*1e6` path and the `as any` casts are gone.
- The two migrated fork tests pass against the consolidated harness using a **real** `ChainManager`.
- The PR #348 lend network tests are rebuilt against a **populated** `marketAllowlist` (no Aave provider constructed with `marketAllowlist: []`), the string-coercion no-op assertion is removed, and namespace execution is OP-only.
- The harness exposes the seams the `e2e-anvil-feature-test` capstone needs (ephemeral fork + real `ChainManager` + fail-loud per-chain funding + `chainId` assertion) so that ticket builds on it without re-fixing any of the above.

## Notes

- **AUGMENT #332 / #348 / #335 - do not open a new ticket.** This is the PR #348 harness-fix set; #332 tracks the fork-harness work and #335 the end-to-end consolidation. Flag it important during implementation.
- This is the harness **prerequisite** the `e2e-anvil-feature-test` capstone is blocked on. It deliberately does **not** author the broadcast-and-assert end-to-end bodies or the three adversarial cases (recipient-in-bytes, residual-allowance, quote-aging) - those are the capstone's; this ticket makes them buildable and non-false-green.
- The seven `CONSOLIDATED E2E SPEC` rows (F188/F200/F210/F223/F230/F241/F254) are per-surface slices of the **one** capstone end-to-end test; they are listed here because the harness they all sit on is what this ticket fixes, not because this ticket implements each slice.
- Scope is SDK testing only: no demo/CLI work and no production-path refactor. RPC trust is out of scope (documented assumption); the harness pins a fork block and validates `chainId`, but does not harden against a hostile RPC.
- The smart-wallet leg's 4337 bundler+paymaster sandbox (F241) is a multi-day capability boundary that lives inside the capstone; this harness ticket only needs to not block it.

---
title: Morpho Borrow Provider + Demo Borrow Tab
type: feat
status: active
date: 2026-04-16
origin: docs/brainstorms/2026-04-15-morpho-borrow-provider-brainstorm.md
---

# Morpho Borrow Provider + Demo Borrow Tab

## Enhancement Summary

**Deepened on:** 2026-04-16
**Sections enhanced:** 10
**Reviews applied:** security-sentinel, architecture-strategist, code-simplicity-reviewer, kieran-typescript-reviewer, performance-oracle, pattern-recognition-specialist, sharp-edges skill, Solidity-security skill, Foundry-testing skill, frontend-ux skill, ERC-4337 atomicity research, Morpho Bundler research.

### Key improvements

1. **Oracle formula corrected** — pseudocode `log10` replaced with the canonical Morpho expression; `baseVaultConversionSample` is now derived from `vault.asset().decimals()`, not a magic number; constructor asserts `price() > 0` and bounded `SCALE_FACTOR`. Flash-loan manipulation surface explicitly acknowledged with either a per-block delta cap or documented demo-trust disclaimer.
2. **Calldata validator tightened** — use `MarketParamsLib.id`-equivalent (blue-sdk `getMarketId()` helper), not tuple-wrapped `encodeAbiParameters`; assert `tx.value === 0n`; wrap decode in try/catch (any error → `CalldataMismatchError{field:'decode'}`, never fall through).
3. **`BorrowQuote` immutable** — `withBorrowAmount(x): BorrowQuote` builder pattern, no in-place mutation; `getQuote` parameters as a discriminated union (`kind: 'byCollateral' | 'byBorrow'`). Slim-down: dropped `version` and `kind` from the quote itself, and `'partialShares'` from `CloseBorrowMode`.
4. **Approval co-located in the same userOp** — ERC-4337 research confirms single-userOp atomicity across Privy/Kernel/Safe/LightAccount; approval + supplyCollateral + borrow land together or all revert. `BATCH_PARTIAL_FAILURE` is unreachable under this design.
5. **Morpho Bundler3 rejected** — not deployed on baseSepolia, `initiator()` transient requires a smart-wallet authorization dance, pulls large transitive deps, and complicates calldata validation. Revisit on mainnet.
6. **Phase 1 split into 1a (required) + 1b (deferred)** — `BaseNamespace` + shared Morpho dir (1a, prerequisite); `BaseProvider` + `BaseWalletNamespace` (1b, after Phase 3 proves the shape).
7. **Performance hardening** — viem multicall batching at client level (5–7× quote-latency reduction), quote-input debounce + client-side HF preview math, `BorrowTab` code-split, allowance-skip optimization, `/borrow/markets` in-memory cache.
8. **Frontend state machine specified** — `BorrowCtaState` discriminated union, per-state loading flags (`isApproving`, `isBorrowing`), explicit `ReviewBorrowModal` for HF<1.2 confirmation, quote-freshness countdown, client-side clamp on repay input.
9. **Safety defaults flipped to pit-of-success** — `maxBorrowSafetyBuffer` default `0.95` (was `1.0`), bounds validated at config load; `LiquidationPrice` remains a first-class field.
10. **Deploy script hardened** — JSON artifacts via `vm.writeFile`, not stdout parsing; per-chain state files; file lock for concurrent safety; `MARKET_ALREADY_CREATED` handled idempotently by reading chain state; Morpho Blue address pinned per chain; Slither + `forge verify-contract` in Phase 2 deliverables.

### New considerations discovered

- `convertToAssets` is **block-level manipulable spot data**; on a testnet with low vault TVL, flash-loan-style inflation is cheap. Demo mitigates with virtual-share seed + trust disclaimer; production would need TWAP.
- `MorphoLendProvider._getPosition` hard-codes `formatUnits(balance, 6)` — fixed as a **separate small PR before Phase 3** (not bundled), per pattern-review.
- Error taxonomy becomes a typed `SdkError` discriminated union in `core/error/`, not stringly-typed codes.
- Test filename conventions enforced per existing precedent: `namespaces/__tests__/*.spec.ts`, backend `*.spec.ts`, `core/` and `providers/` `*.test.ts`.
- RPC-call count in `_getQuote` collapses from 5–7 to 1 with `batch: { multicall: true }` on the viem public client.

---

## Overview

Add a new `BorrowProvider` abstraction to `@eth-optimism/actions-sdk` with a first implementation for Morpho Blue (`MorphoBorrowProvider`), a new Borrow tab in the demo frontend, and the backend + deploy infrastructure to support them. The demo market uses **dUSDC (MetaMorpho vault shares) as yield-bearing collateral** against **OP (demo)** debt — users earn vault yield while borrowing.

This work also generalises the SDK's namespace and provider abstractions so that Lend, Swap, and Borrow share base classes, eliminating per-domain duplication carried over from prior work.

## Problem Statement / Motivation

The SDK today exposes `Lend` (Morpho + Aave) and `Swap` (Uniswap + Velodrome) but has no borrow primitive. Real DeFi users want to post collateral and borrow — especially against yield-bearing positions — and the demo app cannot tell that story. The brainstorm established the full product scope; this plan translates it into phased implementation.

Secondarily, the existing `LendProvider`/`SwapProvider`/namespace code diverged over time: Swap has generic provider-iteration, settings cascades, and a quote-draft pattern; Lend has none of those. Without shared abstractions, Borrow would extend that divergence. The plan treats the generic-namespace lift as a prerequisite; the base-provider/wallet-namespace lift is deferred until Phase 3 confirms the right shape.

(See brainstorm: `docs/brainstorms/2026-04-15-morpho-borrow-provider-brainstorm.md` §2–§8.)

## Proposed Solution

Ship the feature in seven phases along dependency lines:

1. **Phase 1a — Foundations (required, prerequisite).** Generic `BaseNamespace<TProviders, TProvider>`, `BaseWalletNamespace` (sharing `executeTransactionBatch`), shared `packages/sdk/src/providers/morpho/` directory (hard-moved from `lend/providers/morpho/`; all import sites updated in the same commit — no compat shim needed since the only SDK consumers today are the demo backend/frontend in this monorepo), common types (`FilterAssetChain`, `TransactionOptions`, `MarketProviderConfig<T>`).
2. **Phase 1b — BaseProvider lift (deferred).** Extract `BaseProvider<TConfig, TSettings>` after Phase 3 proves the right shape across three concrete providers.
3. **Phase 2 — Contracts & deploy.** New `DynamicVaultOracle.sol`, `DeployMorphoBorrowMarket.s.sol`, rename `DeployMorphoMarket.s.sol` → `DeployMorphoLendMarket.s.sol`, JSON-artifact-based `deploy-demo.sh` orchestration, Slither in CI, basescan verification.
4. **Phase 3 — SDK BorrowProvider.** `BorrowProvider` abstract + `MorphoBorrowProvider` concrete + `MorphoCalldataValidator` + position/HF queries via blue-sdk's `AccrualPosition`; typed `SdkError` hierarchy introduced.
5. **Phase 4 — Namespaces & wiring.** `BaseBorrowNamespace`, `ActionsBorrowNamespace`, `WalletBorrowNamespace`; `Actions.ts` and `Wallet.ts` wiring; settings cascade via `resolveSettings`.
6. **Phase 5 — Backend.** `/borrow/{markets,quote,execute,repay,positions}` endpoints, Zod schemas with `satisfies` parity-checks against SDK types.
7. **Phase 6 — Frontend.** Borrow tab with explicit `BorrowCtaState` machine, `ReviewBorrowModal`, `useBorrowProvider` + `useBorrowQuote` hooks, shared formatters, code-split, ActivityLog types.

Phases 1a and 2 are independent and can run in parallel. Phase 3's integration tests gate on Phase 2 deployment. Phase 3 blocks Phases 4, 5, 6. Phase 1b unblocks optionally after Phase 3. Separate cleanup PR: fix `MorphoLendProvider._getPosition` decimals bug (10-line change) before Phase 3 begins.

## Delivery Plan (PR Breakdown)

This is too much work for one PR. Ship as five stacked PRs, with an optional tail cleanup PR.

| # | PR title (proposed) | Size | Depends on | Scope |
|---|---|---|---|---|
| 1 | `refactor: shared namespace + provider foundations` | M | — | Phase 1a: `BaseNamespace`, `BaseWalletNamespace`, shared `providers/morpho/` directory with re-export shim, common types (`FilterAssetChain`, `TransactionOptions`, `MarketProviderConfig<T>`), `SdkError` class hierarchy in `core/error/`. Refactor existing Lend + Swap namespaces onto the new bases. Also includes `MorphoLendProvider._getPosition` decimal-bug fix. **Zero new features** — all existing tests must pass unchanged. Dedicated review checkpoint. |
| 2 | `feat: morpho borrow market oracle and deploy` | M | — (parallel with PR #1) | Phase 2: `DynamicVaultOracle.sol` + Foundry tests (including flash-loan + donation fuzz), `DeployMorphoBorrowMarket.s.sol`, rename `DeployMorphoMarket.s.sol` → `DeployMorphoLendMarket.s.sol`, JSON-artifact `deploy-demo.sh`, Slither CI job, basescan verification job. Ends with the new borrow market deployed on baseSepolia. Standalone — no SDK code. |
| 3 | `feat: morpho borrow provider sdk` | L | PR #1 merged, PR #2 deployed | Phases 3 + 4 combined: `BorrowProvider` abstract + `MorphoBorrowProvider` + `MorphoCalldataValidator` + immutable `BorrowQuote`; `BaseBorrowNamespace`/`ActionsBorrowNamespace`/`WalletBorrowNamespace`; wire into `Actions.ts` + `Wallet.ts` with `NullBorrowNamespace` proxy; settings cascade + bounds validation; unit + network-integration tests. After merge, `actions.borrow.openPosition(...)` works from a Node script. |
| 4 | `feat: borrow backend endpoints` | S–M | PR #3 | Phase 5: `/borrow/{markets,quote,execute,repay,positions}` controllers + services (`*.spec.ts`), Zod schemas with `satisfies` parity-checks, `requireWalletBorrow` guard, in-memory cache for `/borrow/markets`. |
| 5 | `feat: borrow tab frontend` | L | PR #4 | Phase 6: `BorrowCtaState` machine, `BorrowTab` (code-split), `ReviewBorrowModal`, `useBorrowProvider`/`useBorrowQuote`, HF + liquidation-price displays, shared `formatTokenAmount`/`formatUsd`, `ActionTabs`/`ModeToggle`/`AmountLabel` generalization, ActivityLog extensions, mobile tab un-hardcoding. End-to-end user flow goes live. |
| 6 (optional tail) | `refactor: extract BaseProvider across lend/swap/borrow` | M | PR #3 | Phase 1b: `BaseProvider<TConfig, TSettings>` extraction. Deferred until PR #3 merges so we generalize from three concrete examples, not two. Not on the critical path. |

### Stacking strategy

Reviews may not come back in order, and we should not block forward progress. As each PR is ready:

- **Branch off the previous PR's branch**, not `main`. Target the base PR as the merge base.
- Example chain: `kevin/borrow-foundations` → `kevin/borrow-oracle-deploy` → `kevin/borrow-sdk` → `kevin/borrow-backend` → `kevin/borrow-frontend`.
- When an upstream PR merges to `main`, rebase the dependent branch onto `main` and force-push (after coordinating with any reviewers who have in-flight comments).
- PRs #1 and #2 can both target `main` independently (they're parallel, not stacked).
- PRs #3–#5 stack linearly.

### PR description convention

Every non-leaf PR in the stack must include in its description:

```
Blocked by: #<previous-pr-number>

This PR is part of the Morpho Borrow Provider feature. It builds on the changes
in the preceding PR and should be reviewed after (or in parallel with) it.
See docs/plans/2026-04-16-feat-morpho-borrow-provider-plan.md for the full plan.
```

PRs #1 and #2 note they are the base of the stack. PRs #3–#5 each link their immediate parent. Last PR (#5) includes the full stack list for reviewer orientation.

### Commit conventions within each PR

Each PR should land as a sequence of **minimal, atomic commits**. Guidelines:

- **Each commit is a single logical change** that passes typecheck, lint, and build on its own. Prefer many small commits over a few large ones — easier to review, easier to bisect.
- **Commit messages: 3–7 words, imperative mood, summarize the change.** No AI/Claude/Anthropic references. No trailing ticket numbers in the message body (link tickets in the PR description instead).
- Good examples: `add BaseNamespace abstract class`, `move morpho contracts to shared dir`, `fix lend position decimal formatting`, `add dynamic vault oracle contract`, `wire borrow namespace into actions`, `split ModeToggle labels prop`.
- Bad examples: `stuff`, `wip`, `update files`, `Implement the new BaseNamespace abstract class with generic getAllProviders method following the pattern from BaseSwapNamespace` (too long), `Claude wrote this`.
- **Don't bundle unrelated changes.** A commit that adds a new component and renames an unrelated file should be two commits.
- **When a hook or CI check fails, fix the issue and make a new commit** — don't rewrite history with `--amend` on shared branches. Amending on your own un-pushed local branch is fine.

## Engineering Principles

Applies to every PR in this feature. Non-negotiable unless explicitly called out in review.

### Testing

- **Every new feature ships with tests.** Unit tests for logic in isolation; integration tests for cross-layer interactions (callbacks, userOp batching, error propagation).
- Mock at boundaries (RPC, Privy, bundler). Do **not** mock pure utilities (`encodeFunctionData`, `decodeFunctionData`, `keccak256`, `encodeAbiParameters`) — those are load-bearing for calldata correctness.
- A feature is "done" only when tests are green locally and in CI.
- Every calldata-validator `field` discriminator, every error class, every public method gets at least one test case.

### Reuse before invention

Grep before writing new utilities, mocks, fixtures, or helpers. Known locations:

- Mocks: `packages/sdk/src/__mocks__/`, `packages/sdk/src/lend/__mocks__/`, `packages/sdk/src/swap/__mocks__/`
- Validation helpers: `packages/sdk/src/utils/validation.ts` (`validateChainSupported`, `validateAmountProvided`, `validateNotBothAmounts`, etc.)
- Approval helpers: `packages/sdk/src/utils/approve.ts` (`buildErc20ApprovalTx`, `checkTokenAllowance`, `buildPermit2ApprovalTx`)
- Asset math: `packages/sdk/src/utils/assets.ts` (`parseAssetAmount`, `formatAssetAmount`, `getAssetAddress`, `isNativeAsset`)
- BigInt serialization (backend): `packages/demo/backend/src/utils/serializers.ts` (`serializeBigInt`)
- Display formatters (frontend): `packages/demo/frontend/src/utils/formatters.ts`

If an existing helper nearly fits: extend or generalize it, don't write a second one. Follow neighbor-file naming conventions (`*Raw` suffix for bigint outputs; `getX` / `buildX` / `resolveX` / `validateX` verbs).

### Abstraction hierarchy

- **Shareable code does not live inside a specific provider.** If logic is general enough to be used by more than one provider (Morpho + Aave, Lend + Borrow, etc.), it belongs in a base class, a shared utility, or the cross-domain `packages/sdk/src/providers/<protocol>/` directory — not in a concrete provider file.
- **Provider implementations stay thin.** `MorphoBorrowProvider`, `AaveLendProvider`, `UniswapSwapProvider` should hold only code that's specific to that exact protocol integration: contract calls, protocol-specific encoding, protocol-specific quirks. Validation, amount conversion, approval building, chain intersection, error wrapping, calldata verification — all belong higher up the hierarchy.
- When you find yourself adding code to a concrete provider, ask: "Would a second concrete provider want this same code?" If yes, hoist to the base class or shared module before landing.
- **Extraction trigger: the second usage, not the third.** The moment you would copy-paste from one provider to another, that's the signal to extract. Don't wait for the third duplication to "justify" the abstraction — by then the drift is already painful.

### Structure

- **Single responsibility**: one concern per function, one domain per module. If a function name needs "and" to describe it, split it.
- **Function length**: target ≤ 20 lines of logic. If longer, extract named sub-steps.
- **File length**: target ≤ 200 lines. If longer, split along responsibility lines (pure helpers separate from provider glue; type definitions separate from implementations).
- **Nesting**: max 2 levels of control flow inside a function. Prefer early returns and guard clauses over nested `if`/`else`.

### Readability

- Clear names beat clever tricks. `collateralAmountRaw` is better than `c`. No one-letter locals outside loop indices.
- Comments explain **why**, not **what**. Reserve for non-obvious invariants, surprising behavior, or workaround context.
- Delete dead code, unused imports, and commented-out blocks as you encounter them. No `// TODO: remove this` without an owner and a linked issue.

### Enforcement

- Run `pnpm typecheck && pnpm lint && pnpm test` before every commit.
- **Zero new lint warnings.** Not just zero errors — a PR that silences warnings via `// eslint-disable` is a PR that needs justification in review. Treat the lint baseline as a ratchet: warnings only go down.
- If a principle is intentionally violated to ship a time-critical fix, leave a `// TODO(@handle):` with a linked follow-up issue in the same PR — never in a later one.

## Technical Approach

### Architecture

```
packages/sdk/src/
  core/
    error/
      errors.ts                (extend) SdkError base + typed subclasses (CalldataMismatchError, QuoteStaleError, …)
    BaseNamespace.ts           (new, Phase 1a) generic getAllProviders/supportedChainIds/market fan-out
    BaseWalletNamespace.ts     (new, Phase 1a) executeTransactionBatch shared logic
    BaseProvider.ts            (new, Phase 1b deferred) chainManager, supportedChainIds, buildApprovalTx
  providers/
    morpho/                    (new, Phase 1a — shared Morpho code)
      contracts.ts             MORPHO_BLUE address (pinned per chain), IRM per chain
      abis.ts                  re-exports blueAbi, metaMorphoAbi, adaptiveCurveIrmAbi (preserve `as const`)
      types.ts                 MarketParams, MorphoContractsRegistry
      calldata.ts              MorphoCalldataValidator (Morpho-specific, called from MorphoBorrowProvider)
      marketId.ts              canonical id derivation (reuses blue-sdk `getMarketId` helper)
  lend/providers/morpho/       (existing contracts.ts deleted — hard-move to providers/morpho/)
  borrow/                      (new, Phase 3)
    core/BorrowProvider.ts
    providers/morpho/
      MorphoBorrowProvider.ts
      sdk.ts                   position/HF queries via AccrualPosition
      __tests__/               *.test.ts
      __mocks__/               MockMorphoBorrowProvider following MockedFunction pattern
    namespaces/
      BaseBorrowNamespace.ts
      ActionsBorrowNamespace.ts
      WalletBorrowNamespace.ts
      __tests__/               *.spec.ts (matches existing lend/namespaces convention)
  types/
    common/                    (new, Phase 1a)
      FilterAssetChain.ts
      TransactionOptions.ts    (hard-renamed from LendOptions; demo consumers updated in same commit)
      MarketProviderConfig.ts
    borrow/
      base.ts                  BorrowMarketConfig, BorrowMarketId (branded Hex), BorrowMarketPosition, BorrowQuote (immutable), OpenBorrowInput, CloseBorrowMode, BorrowProviderConfig<T>, BorrowSettings
      morpho.ts                Morpho-specific quote context
```

Key shape: `LendMarketId` stays address-based (vault contract), `BorrowMarketConfig` uses `{ collateralAsset, borrowAsset, chainId, name, borrowProvider }`; `BorrowMarketId` is a branded `Hex`. Callers never pass raw `bytes32` market IDs; the SDK derives them via `getMarketId` (blue-sdk helper which matches `MarketParamsLib.id` assembly). (See brainstorm: §5.)

### Oracle design

**Contract: `DynamicVaultOracle.sol`** — new Solidity file in `packages/demo/contracts/src/`.

The oracle prices dUSDC (18-dec shares backed by 6-dec USDC) in terms of OP (18-dec). Because the demo runs on baseSepolia with no real Chainlink feeds for demo tokens, we decompose:

```
price_dUSDC_in_OP = (usdc_per_share) × (op_per_usdc)
```

- **`usdc_per_share`** — dynamic, via `IERC4626(vault).convertToAssets(baseVaultConversionSample)`. As the MetaMorpho vault accrues yield, `convertToAssets` increases, so collateral value grows with the vault.
- **`op_per_usdc`** — immutable constructor parameter (`loanPerUnderlyingWad`, WAD-scaled).

**Constructor signature and invariants:**

```solidity
constructor(IERC4626 vault, uint256 loanPerUnderlyingWad) {
    VAULT = vault;
    uint8 underlyingDecimals = IERC20Metadata(vault.asset()).decimals();
    uint8 loanDecimals = 18;       // OP
    uint8 collateralDecimals = 18; // dUSDC shares

    // Derive sample internally — no magic numbers from caller.
    BASE_VAULT_CONVERSION_SAMPLE = 10 ** (underlyingDecimals + 4);

    // Morpho-canonical scale: price returns 1e36 × (loan per collateral) expressed
    // in (loanDecimals - collateralDecimals)-adjusted units. With both sides 18-dec
    // and the conversion sample bridging underlying→share-equivalent:
    //   SCALE_FACTOR = 1e36 × 10^(loanDecimals - underlyingDecimals) / BASE_VAULT_CONVERSION_SAMPLE
    SCALE_FACTOR = (10 ** (36 + loanDecimals - underlyingDecimals)) / BASE_VAULT_CONVERSION_SAMPLE;

    // Sanity bounds catch decimal-shift errors.
    require(SCALE_FACTOR > 0 && SCALE_FACTOR < 10 ** 72, "bad scale");
    require(loanPerUnderlyingWad >= 1e15 && loanPerUnderlyingWad <= 1e21, "implausible rate");
    LOAN_PER_UNDERLYING_WAD = loanPerUnderlyingWad;

    // Construction-time self-check — reverts if the freshly deployed oracle
    // returns zero under the current vault state.
    require(price() > 0, "oracle self-check failed");

    emit OracleDeployed(address(vault), loanPerUnderlyingWad, BASE_VAULT_CONVERSION_SAMPLE, SCALE_FACTOR);
}

function price() external view returns (uint256) {
    uint256 underlyingPerSample = VAULT.convertToAssets(BASE_VAULT_CONVERSION_SAMPLE);
    // Multiply-before-divide; overflow analysis: max ~ 1e10 × 1e21 × 1e66 ≈ 1e97 < 2^320.
    // In uint256 we stay under 2^256 because SCALE_FACTOR × LOAN_PER_UNDERLYING_WAD ≤ 1e93.
    return (underlyingPerSample * LOAN_PER_UNDERLYING_WAD * SCALE_FACTOR) / 1e18;
}
```

**Security properties and known trust assumptions (from Solidity-security + security-sentinel reviews):**

- **Flash-loan manipulability of `convertToAssets`** — MetaMorpho's `totalAssets` is the sum across child markets; it can be inflated in the same block. For the demo, we mitigate via (a) the virtual-share seed (≥1 USDC-equivalent to `0x…dEaD` pre-`createMarket`) and (b) an **explicit risk-table entry** accepting that testnet positions are "liquidation bait" — not a silent omission. For production, wrap with a 30-min TWAP or add a `MAX_PRICE_DELTA_BPS` per-block sanity cap. Documented under "Risk Analysis" row "Oracle manipulation".
- **Vault upgrade risk** — we hardcode the vault address. MetaMorpho allows curator-controlled allocation changes. Demo accepts this; plan flags it under "State lifecycle risks" as a trust assumption.
- **Reentrancy** — `price()` is `view` and calls `convertToAssets` (also `view`). Test asserts no state mutation (via `vm.record`).
- **Donation inflation** — deploy script seeds ≥ 1 USD of virtual shares to `0x…dEaD` before `createMarket`. Seed amount asserted in the deploy script, not just documented.
- **`convertToAssets` vs `previewRedeem`** — use `convertToAssets` always. `previewRedeem` is fee-distorted.

**Decimals reference for this market:**
- `loanToken = OP_DEMO`, `loanDecimals = 18`
- `collateralToken = dUSDC (vault shares)`, `collateralDecimals = 18`
- `underlying (asset of vault) = USDC_DEMO`, `underlyingDecimals = 6`
- `BASE_VAULT_CONVERSION_SAMPLE = 10^(6+4) = 1e10` (derived, not passed)

(See brainstorm: §2 market design; resolved decision: dynamic oracle via `vault.convertToAssets()`.)

### Calldata integrity validation

Novel capability in this repo — issue #373 tracks backporting to `SwapProvider`. Module: `packages/sdk/src/providers/morpho/calldata.ts`.

For each of `supplyCollateral` / `borrow` / `repay` / `withdrawCollateral` the validator, in order:

1. **`tx.to === MORPHO_BLUE[chainId]`** — pinned address lookup, not trusted from config.
2. **`tx.value === 0n`** — all four functions are non-payable.
3. **`tx.data.length >= minLen`** — selector (4) + encoded args minimum.
4. **Selector match** — `tx.data.slice(0, 10) === SELECTORS[functionName]` where selectors are precomputed at module load via `toFunctionSelector`.
5. **Decode with try/catch**:
   ```ts
   let decoded: DecodedBlueCall;
   try {
     decoded = decodeFunctionData({ abi: blueAbi, data: tx.data });
   } catch {
     throw new CalldataMismatchError({ field: 'decode' });
   }
   if (decoded.functionName !== expectedName) {
     throw new CalldataMismatchError({ field: 'selector' });
   }
   ```
   `functionName` narrowing drives `args` type-safety — no `as any`.
6. **MarketParams id** — recompute via `getMarketId(decoded.args[0])` (blue-sdk helper that matches `MarketParamsLib.id`'s assembly: `keccak256` over the packed 5×32-byte struct). Compare against `expectedMarketId`. Never use `encodeAbiParameters` with a `tuple` wrapper — that adds a 32-byte offset prefix and produces the wrong hash.
7. **Recipient/onBehalf** — `onBehalf === wallet.address` by default. To accommodate future bundler paths, the validator accepts a `config.allowedOnBehalf: Set<Address>` and checks membership. Demo ships with `allowedOnBehalf = { wallet.address }`.
8. **Amount/shares** — exact equality with the quote's `*Raw` fields (e.g. `decoded.args[1] === quote.borrowAmountRaw`). For `repay` with `mode: 'full'`, validator expects `assets === 0n && shares === position.borrowSharesRaw` (dust-safe). Shares are **re-fetched at execution time**, not carried from quote — protects against griefer repaying a micro amount between quote and execute (per security-sentinel H4).

The validator's return type is `void` — it throws on any inconsistency and catches any unexpected error into `CalldataMismatchError{field:'decode'}`. Validator unit tests include a "random bytes" negative case and a table-driven case per `field` (7 discriminators).

### Quote contract — immutable with builder

**Number convention** (inherited from existing Swap/Lend types — see `packages/sdk/src/types/swap/base.ts:198-209`, `packages/sdk/src/types/asset.ts:27-33`): every bigint field in public types is suffixed `Raw`. Paired human-readable `number` fields (no suffix) are for display only and should not be used for precision arithmetic. Input params to SDK methods accept `number` (human-readable) and the provider `parseUnits`es internally — matching `LendProvider.openPosition`'s pattern at `packages/sdk/src/lend/core/LendProvider.ts:95-98`.

`BorrowQuote` is **frozen** after construction. Mutators return a new quote:

```ts
type BorrowQuote = {
  readonly _tag: 'BorrowQuote';
  readonly quotedAt: number;
  readonly quotedAtBlock: bigint;
  readonly market: BorrowMarketConfig;
  readonly marketId: BorrowMarketId;     // derived from marketParams; kept for API convenience
  readonly marketParams: MarketParams;
  readonly chainId: SupportedChainId;

  // Display-only (human-readable, parseFloat-reconstructed). Do NOT use for precision.
  readonly collateralAmount: number;
  readonly borrowAmount: number;
  readonly healthFactor: number;        // e.g. 1.45 (Infinity when debt=0)
  readonly liquidationPrice: number;    // USD-equivalent of oracle price
  readonly ltv: number;                 // e.g. 0.624

  // Precision fields (bigint, on-chain-scale).
  readonly collateralAmountRaw: bigint;
  readonly borrowAmountRaw: bigint;
  readonly healthFactorRaw: bigint;     // WAD (1e18-scaled); MaxUint256 when debt=0
  readonly liquidationPriceRaw: bigint; // Morpho oracle scale (36 + loanDec - colDec)
  readonly ltvRaw: bigint;              // WAD

  readonly execution: { readonly calldata: Hex; readonly value: bigint; readonly to: Address };

  withBorrowAmount(x: number): BorrowQuote;   // accepts human-readable; recomputes execution, HF, LP
  withRecipient(addr: Address): BorrowQuote;
};
```

Dropped from an earlier draft: `version` (redundant given `Object.freeze` immutability — each builder call returns a new object with its own identity) and `kind` (not load-bearing for execution; `withBorrowAmount` works regardless of which side was the user's original input).

**Parameter types are discriminated unions** (no mutually-exclusive optional fields). Inputs are human-readable `number` — SDK converts to wei internally, matching existing Lend/Swap signatures:

```ts
type BorrowQuoteParams =
  | { kind: 'byCollateral'; collateralAmount: number; market: BorrowMarketConfig; includeCalldata?: boolean }
  | { kind: 'byBorrow';     borrowAmount: number;     market: BorrowMarketConfig; includeCalldata?: boolean };

type OpenBorrowInput =
  | (BorrowQuote & { _tag: 'BorrowQuote' })          // branded — cannot be forged
  | { _tag?: never; market: BorrowMarketConfig; borrowAmount: number };

type CloseBorrowMode =
  | { mode: 'full' }                                                            // SDK fills shares = position.borrowSharesRaw (dust-safe)
  | { mode: 'partialAssets'; assets: number; withdrawCollateral?: boolean };    // human-readable asset amount
```

`kind` on `BorrowQuoteParams` stays — it's the user's explicit choice of which direction they're quoting, and the discriminated union eliminates the "both-fields-set" footgun. `'partialShares'` dropped from `CloseBorrowMode`; full-repay's shares path is handled internally by `mode: 'full'`. If a consumer ever needs exact-shares repay, we'll add it then.

`BorrowMarketPosition` follows the same dual-field convention:

```ts
type BorrowMarketPosition = {
  readonly marketId: BorrowMarketId;
  readonly collateral: number;
  readonly collateralRaw: bigint;
  readonly debt: number;
  readonly debtRaw: bigint;              // AccrualPosition.borrowAssets
  readonly borrowSharesRaw: bigint;      // internal; used for dust-safe full repay
  readonly healthFactor: number;
  readonly healthFactorRaw: bigint;      // WAD
  readonly liquidationPrice: number;
  readonly liquidationPriceRaw: bigint;
  readonly ltv: number;
  readonly ltvRaw: bigint;
};
```

**Wire format across layers** (per existing Lend/Swap convention):
- Frontend → backend: human-readable `number` in request bodies; Zod schema `amount: z.number().positive()` (matches `controllers/lend.ts:20`).
- Backend → SDK: `number` passed through; SDK's `parseUnits(value.toString(), decimals)` handles conversion.
- SDK → backend response: `bigint`s internally; backend wraps responses in `serializeBigInt(...)` (`packages/demo/backend/src/utils/serializers.ts:5-11`) which JSON-replaces bigint → decimal string.
- Backend → frontend: strings on the wire; frontend manually re-hydrates specific fields with `BigInt(...)` at the API-client boundary (see `packages/demo/frontend/src/api/actionsApi.ts:81-107,138-142`). Borrow's API client adds `BigInt(...)` for every `*Raw` field returned.
- Validator asserts calldata `args` against `*Raw` fields, not display fields.

Staleness: `openPosition(quote)` rejects with `QuoteStaleError` if `Date.now() - quote.quotedAt > settings.quoteExpirationSeconds` **or** `currentBlock - quote.quotedAtBlock > maxQuoteAgeBlocks`. On baseSepolia (2s blocks), sensible defaults: `quoteExpirationSeconds = 60`, `maxQuoteAgeBlocks = 15` (~30s) — the block limit binds first on fast paths, time limit covers stalled bundler resubmit. Block tag `quotedAtBlock` is captured once at `_getQuote` entry; all reads (market, position, oracle) pinned to that block via `client.readContract({ blockNumber: quotedAtBlock, … })`.

Bidirectional semantics (brainstorm §2):
- `getQuote({ kind: 'byCollateral', collateralAmount })` — returns max borrow at `maxBorrowSafetyBuffer × max LTV`.
- `getQuote({ kind: 'byBorrow', borrowAmount })` — returns required collateral at `maxBorrowSafetyBuffer × max LTV`.

**Safety buffer default: `0.95`** (was `1.0`). Configurable via `settings.maxBorrowSafetyBuffer`; validated at config load with bounds `[0.50, 0.99]` inclusive. Opt-out to `1.0` requires an explicit warning log. (See sharp-edges review, item #1.)

`ActionsBorrowNamespace.getQuote` defaults `includeCalldata: false`; `WalletBorrowNamespace.getQuote` defaults `includeCalldata: true`. Mirrors issue #331.

### Position math & health factor

Use `@morpho-org/blue-sdk-viem`'s `AccrualPosition.fetch(user, marketId, client)`. The SDK client is instantiated with `batch: { multicall: true }` so `Market.fetch + AccrualPosition.fetch + oracle.price()` collapse into a single multicall3 RPC round-trip (5–7× latency improvement per performance-oracle review).

Blue-sdk's `AccrualPosition` returns bigints on the upstream getters (`healthFactor`, `liquidationPrice`, `ltv`, `borrowAssets`, `borrowShares`, `collateralValue`, `isHealthy`). The SDK's `_getPosition` wraps those into a `BorrowMarketPosition` that follows the repo's `Raw` convention — e.g., upstream `healthFactor: bigint` becomes `{ healthFactor: number (WAD/1e18), healthFactorRaw: bigint }`; upstream `borrowAssets` becomes `{ debt: number, debtRaw: bigint }`; upstream `borrowShares` becomes `borrowSharesRaw: bigint` (no display counterpart — shares are internal-only).

No manual HF math in SDK core. Fixture tests against HF = 1.0, 1.0001, 0.9999 at LLTV=86% confirm SDK agrees with on-chain `_isHealthy`.

**Full-repay uses shares, not assets:**
```ts
repay(marketParams, 0n, position.borrowSharesRaw, user, '0x')
```
`borrowSharesRaw` is re-fetched inside `_closePosition` immediately before encoding — not carried from quote time — to close the griefer-induced TOCTOU window.

### Batching strategy (verified via ERC-4337 research)

`_openPosition` returns a single userOp comprising (in `calls: [...]` array form — not sequential `sendTransaction` calls):

```ts
const calls: Call[] = [];
const allowance = await checkAllowance(dUSDC, MORPHO_BLUE, user);
if (allowance < collateralAmountRaw) {
  calls.push({ to: dUSDC, data: encodeApprove(MORPHO_BLUE, collateralAmountRaw), value: 0n });
}
calls.push({ to: MORPHO_BLUE, data: encodeSupplyCollateral(...), value: 0n });
calls.push({ to: MORPHO_BLUE, data: encodeBorrow(...), value: 0n });
return wallet.sendBatch(calls);  // single userOp, atomic
```

**Critical invariant**: `wallet.sendBatch(calls)` MUST produce **one** userOp with an `executeBatch` / MultiSend-style `callData`. Unit test asserts the Privy client receives exactly one `sendTransaction({ calls })` call. If the wallet provider dispatches N sequential userOps instead, atomicity is lost. Verified against `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts` during Phase 3.

Because approval + supplyCollateral + borrow share a frame, `BATCH_PARTIAL_FAILURE` is unreachable. Allowance is skipped when already sufficient — saves one call + ~40–60k gas.

**Gas safety multiplier:** `callGasLimit` is set to `bundlerEstimate × 1.25` to cover dummy-signature estimation gaps and storage-touching overhead in Morpho writes (per ERC-4337 research).

### Implementation Phases

#### Phase 1a: Foundations (required prerequisite)

**Files created:**
- `packages/sdk/src/core/BaseNamespace.ts` — `abstract class BaseNamespace<TProvider extends ProviderBase, TProviders extends Record<string, TProvider | undefined>>`. Generic `getAllProviders(): TProvider[]` via `Object.values(this.providers).filter((p): p is TProvider => p !== undefined)`. `supportedChainIds(): SupportedChainId[]` union of per-provider chain sets.
- `packages/sdk/src/core/BaseWalletNamespace.ts` — generic `executeTransactionBatch(transaction, chainId)` that handles the 2-call approval+position and 3-call permit2+permit2+swap shapes via a variadic Call[] arg.
- `packages/sdk/src/providers/morpho/{contracts,abis,types,marketId}.ts` — shared Morpho code. `contracts.ts` pins `MORPHO_BLUE` and the IRM per chain. The file is hard-moved out of `lend/providers/morpho/`; all importers (MorphoLendProvider, lend sdk, lend tests, demo backend market config) are updated in the same commit. No compat shim — only the demo backend/frontend in this monorepo consume the SDK today.
- `packages/sdk/src/types/common/{FilterAssetChain,TransactionOptions,MarketProviderConfig}.ts`
- `packages/sdk/src/core/error/errors.ts` — extend with `SdkError` abstract base + `CalldataMismatchError`, `QuoteStaleError`, `UnhealthyPositionError`, `InsufficientLiquidityError`, `OracleUnavailableError`, `ChainMismatchError`, `MarketNotCreatedError`. Each carries structured payload; `TransactionConfirmedButRevertedError` already exists.

**Files refactored:**
- `packages/sdk/src/lend/namespaces/BaseLendNamespace.ts` → extends new `BaseNamespace`; replace hard-coded `getAllProviders()` (lines 57–61) with inherited generic version.
- `packages/sdk/src/swap/namespaces/BaseSwapNamespace.ts` → extends new `BaseNamespace`.
- `packages/sdk/src/lend/namespaces/WalletLendNamespace.ts` + `WalletSwapNamespace.ts` → extend `BaseWalletNamespace`, remove duplicated `executeTransaction` method.
- `packages/sdk/src/lend/providers/morpho/contracts.ts` → deleted. All importers updated to point at `@/providers/morpho/contracts.js` in the same commit.
- `types/lend/base.ts` → `LendOptions` deleted; all importers updated to `TransactionOptions` from `types/common` in the same commit.

**Separate cleanup PR (lands before this phase):**
- Fix `MorphoLendProvider._getPosition` decimal bug at `packages/sdk/src/lend/providers/morpho/MorphoLendProvider.ts:209` — use `asset.metadata.decimals`.

**Deliverables:**
- Existing lend + swap tests pass unchanged (behaviour preserved).
- New `BaseNamespace.test.ts`, `BaseWalletNamespace.test.ts` cover the shared surface.
- `SdkError` subclasses tested for payload shape.

**Review checkpoint.** Merge-ready PR before Phase 3 begins.

#### Phase 1b: BaseProvider lift (deferred, post-Phase 3)

Only begun after Phase 3 merges, so we can extract from three concrete examples (LendProvider, SwapProvider, BorrowProvider) rather than generalising from two. Delivers `BaseProvider<TConfig, TSettings>` with the generic in second position to handle the settings asymmetry (Lend currently none; Swap/Borrow both have settings objects).

#### Phase 2: Contracts & deploy (parallel with Phase 1a)

**Files created:**
- `packages/demo/contracts/src/DynamicVaultOracle.sol` — per "Oracle design" section above.
- `packages/demo/contracts/script/DeployMorphoBorrowMarket.s.sol` — env vars `DEMO_OP_ADDRESS`, `DEMO_VAULT_ADDRESS`, `MORPHO_BLUE_ADDRESS`; validates env (`.code.length > 0`, ERC-20 metadata sane); asserts `MORPHO_BLUE == EXPECTED_MORPHO_BLUE_FOR_CHAIN[chainId]`; asserts `isLltvEnabled(86%)`; deploys oracle (constructor self-check covers price sanity); deploys market via `createMarket`; seeds ≥ 1 USD of virtual shares to `0x…dEaD` before liquidity supply; supplies OP liquidity; writes `broadcast/DeployMorphoBorrowMarket.s.sol/<chainId>/run-latest.json` plus an explicit `state/borrow-market.<chainId>.json` via `vm.writeFile` with `{ oracle, marketId, marketParams }`.
- `packages/demo/contracts/test/DynamicVaultOracle.t.sol` — Foundry tests per "Testing Strategy" subsection below.

**Files renamed:**
- `packages/demo/contracts/script/DeployMorphoMarket.s.sol` → `DeployMorphoLendMarket.s.sol`.

**Files updated:**
- `packages/demo/contracts/script/deploy-demo.sh` — add step 2b between current steps 2 and 3. **JSON-artifact handoff, not stdout parsing**: the script reads `state/borrow-market.$CHAIN_ID.json` via `jq` and validates schema (oracle: 0x…, marketId: 0x… 32 bytes). Acquires `flock state/.lock` around the read-modify-write cycle. Per-chain state file is keyed by `$CHAIN_ID`. On Morpho Blue's `MARKET_ALREADY_CREATED` revert, script queries `market(id)` on-chain; if fields match expectation, writes state and succeeds (idempotent via chain truth, not local JSON).
- `packages/demo/contracts/foundry.toml` — `[profile.default] fuzz.runs = 1000`; `[profile.deep] fuzz.runs = 10000, invariant.runs = 512, invariant.depth = 50`.
- `.circleci/config.yml` — new job `slither` running `slither packages/demo/contracts`; new job `verify-contracts` running `forge verify-contract` against basescan on main-branch merges.

**Deliverables:**
- Fresh `deploy-demo.sh` run succeeds on a clean baseSepolia fork.
- Partial-failure rerun (delete only borrow state keys) resumes cleanly.
- Oracle contract verified on basescan.
- Slither reports zero high/medium findings on `DynamicVaultOracle.sol`; any suppressions documented inline with reason.
- Gas snapshot of `createMarket` + `supply` recorded.

#### Phase 3: SDK BorrowProvider

**Files created:**
- `packages/sdk/src/borrow/core/BorrowProvider.ts` — abstract; public methods `openPosition`, `closePosition`, `getQuote`, `getMarket`, `getMarkets`, `getPosition`, `getPositions`; protected abstracts `_openPosition`, `_closePosition`, `_getQuote`, `_getMarket`, `_getMarkets`, `_getPosition`, `_getPositions`.

  Note on `getPositions` plural: pattern-review flagged LendProvider is singular-only. Decision: **add `getPositions` to LendProvider as part of the follow-up API harmonization**, tracked as a distinct issue. For Phase 3, Borrow ships with both — multi-position iteration is a natural fit for the BorrowMarketConfig catalog model even at N=1 markets.

- `packages/sdk/src/borrow/providers/morpho/MorphoBorrowProvider.ts`. Uses `blueAbi` + `encodeFunctionData` directly (no `BlueAction` helper in `blue-sdk-viem`). Client is instantiated with `batch: { multicall: true }`. Fetches `Market`, `AccrualPosition`, `oracle.price()` collapse to one multicall3 call.

- `packages/sdk/src/borrow/providers/morpho/sdk.ts` — Morpho-specific read helpers.

- `packages/sdk/src/types/borrow/{base,morpho}.ts` — immutable-quote + discriminated-union types as spec'd under "Quote contract".

- `packages/sdk/src/borrow/__tests__/BorrowProvider.test.ts` — subclass-to-expose-protected pattern from `LendProvider.test.ts:10-18`. Calldata-validator test matrix is table-driven, one case per `field` discriminator (7 cases) + "random bytes" negative case.

- `packages/sdk/src/borrow/providers/morpho/__tests__/MorphoBorrowProvider.test.ts`

- `packages/sdk/src/borrow/__mocks__/MockMorphoBorrowProvider.ts` — follows existing `MockLendProvider`'s `MockedFunction` field-reassignment shape verbatim.

**Deliverables:**
- Unit tests on `BorrowProvider` validation paths.
- Network-project integration tests against baseSepolia covering open / quote / full-close / partial-repay.
- Fixture HF tests at 1.0 / 1.0001 / 0.9999 using Anvil fork + block-time manipulation.
- Phase 3 integration tests gated on Phase 2 deployment.

#### Phase 4: Namespaces & wiring

**Files created:**
- `packages/sdk/src/borrow/namespaces/{BaseBorrowNamespace,ActionsBorrowNamespace,WalletBorrowNamespace}.ts`
- `packages/sdk/src/borrow/namespaces/__tests__/*.spec.ts` (matches existing `BaseLendNamespace.spec.ts` naming).

**Files updated:**
- `packages/sdk/src/actions.ts` — add `_borrow`, `_borrowProviders`; wire `MorphoBorrowProvider` from `config.borrow.morpho`; `borrow` getter throws `BorrowProviderNotConfiguredError` if not configured (typed error, not bare `Error`).
- `packages/sdk/src/wallet/core/wallets/abstract/Wallet.ts` — `wallet.borrow` is always defined via a `NullBorrowNamespace` proxy when no provider configured; each method throws `BorrowProviderNotConfiguredError` on call. Eliminates the `wallet.borrow?.openPosition(...)` silent-no-op footgun (sharp-edges review #9).
- `packages/sdk/src/types/actions.ts` — add `BorrowConfig` (following SwapConfig shape with `.settings`). Also **add optional `.settings?: LendSettings` to `LendConfig`** (empty interface reserved) to keep configs parallel without silent divergence (architecture-strategist risk #4).
- `packages/sdk/src/types/providers.ts` — add `BorrowProviders = { morpho?: MorphoBorrowProvider }`.

**Settings cascade** implemented via a typed resolver:
```ts
function resolveSettings(
  providerOverride: Partial<BorrowSettings> | undefined,
  configOverride: Partial<BorrowSettings> | undefined,
): BorrowSettings { /* provider > config > default; output is non-partial */ }
```
Bounds-check at the resolver boundary: `maxBorrowSafetyBuffer ∈ [0.50, 0.99]`; `quoteExpirationSeconds ∈ [15, 600]`; `maxQuoteAgeBlocks ∈ [1, 120]`.

#### Phase 5: Backend

**Files created:**
- `packages/demo/backend/src/controllers/borrow.ts` — endpoints: `GET /borrow/markets`, `POST /borrow/quote`, `POST /borrow/execute`, `POST /borrow/repay`, `GET /borrow/positions`. Zod schemas; every schema carries a `type _Check = z.infer<typeof schema> satisfies SdkType` compile-time parity assertion.
- `packages/demo/backend/src/services/borrow.ts`
- `packages/demo/backend/src/controllers/borrow.spec.ts` (matches existing `lend.spec.ts` convention)

**Files updated:**
- `packages/demo/backend/src/router.ts` — add 5 routes under `/borrow/*`.
- `packages/demo/backend/src/services/wallet.ts` — `requireWalletBorrow` guard.
- In-memory cache for `/borrow/markets` (static config; invalidate on process restart; no Redis).

**Endpoint naming.** Adopt brainstorm's `/borrow/execute` + `/borrow/repay`; Lend's existing `/position/open` + `/position/close` untouched. Harmonization tracked as a separate issue.

#### Phase 6: Frontend Borrow tab

**Files created:**
- `packages/demo/frontend/src/components/earn/BorrowTab.tsx` — code-split via `React.lazy(() => import('./BorrowTab'))` from the parent Earn page.
- `packages/demo/frontend/src/components/earn/BorrowAction.tsx` — renders per-state CTA driven by `BorrowCtaState`.
- `packages/demo/frontend/src/components/earn/ReviewBorrowModal.tsx` — the HF<1.2 confirmation step; displays before/after HF, liquidation price, quote freshness countdown, checkbox "I understand this may liquidate". Modeled on existing `ReviewSwapModal`.
- `packages/demo/frontend/src/components/earn/HealthFactorDisplay.tsx` — colored decimal; thresholds green > 1.5, amber 1.1–1.5, red < 1.1; `before → after` arrow variant; red pulse < 1.1.
- `packages/demo/frontend/src/components/earn/LiquidationPriceDisplay.tsx` — inlined into `BorrowPositionSummary` unless reused elsewhere (simplicity review).
- `packages/demo/frontend/src/components/earn/BorrowPositionSummary.tsx`
- `packages/demo/frontend/src/hooks/useBorrowProvider.ts` — returns `{ getMarkets, getQuote, openPosition, closePosition, getPosition, isLoading, error }` with all methods typed against SDK types.
- `packages/demo/frontend/src/hooks/useBorrowQuote.ts` — returns `{ quote, isFetching, isStale, refresh, countdownSeconds }`; auto-refresh at T-5s; `AbortController` cancels in-flight requests on amount change.
- `packages/demo/frontend/src/utils/formatTokenAmount.ts`, `formatUsd.ts` — shared formatters. Token amounts: thousands separators, per-token decimal precision, `1.23M` abbreviation above 1e6. USD: `$1,234.56`, `$1.2M` above 1e6. Components never call `.toFixed` inline.

**Files updated:**
- `packages/demo/frontend/src/components/earn/ActionTabs.tsx` — `ActionType = 'lend' | 'swap' | 'borrow'`; `BORROW_ACTIONS` set; generalise `isTabHighlighted` for 3 tabs.
- `packages/demo/frontend/src/components/earn/Earn.tsx` — `{activeTab === 'borrow' && <BorrowTab/>}`; unhardcode mobile tabs at line 131 to `TABS.map(t => t.id)`.
- `packages/demo/frontend/src/components/earn/ModeToggle.tsx` — discriminated mode type `type Mode = 'lend' | 'withdraw' | 'borrow' | 'repay'`; labels passed as prop. (Pattern-review preferred union over generic at N≤3.)
- `packages/demo/frontend/src/components/earn/AmountLabel.tsx` — mode-aware label map.
- `packages/demo/frontend/src/hooks/useLendProvider.ts` — `EarnOperations` extended with borrow methods.
- `packages/demo/frontend/src/constants/activityLogConfigs.ts` — add `borrow`, `repay`, `getBorrowMarket`, `getBorrowPosition`, `getBorrowQuote`.
- `packages/demo/frontend/src/providers/ActivityLogProvider.tsx` — extend `ActivityEntry.type` with `'borrow' | 'repay'`; metadata gains `collateralAmount`, `borrowAmount`, `healthFactor`, `borrowAssetSymbol`, `collateralAssetSymbol`. Rehydration coalesces multi-entry reconciliation into a single multicall (per performance-oracle review).

**`BorrowCtaState` state machine** (frontend-ux review):

```ts
type BorrowCtaState =
  | { kind: 'disconnected' }
  | { kind: 'wrongNetwork'; targetChainId: SupportedChainId }
  | { kind: 'emptyCollateral' }        // user has 0 dUSDC
  | { kind: 'insufficientLiquidity' }  // market cannot fulfill
  | { kind: 'quoteLoading' }
  | { kind: 'quoteStale' }
  | { kind: 'needsApproval'; isApproving: boolean }
  | { kind: 'ready'; isBorrowing: boolean; requiresConfirm: boolean }
  | { kind: 'pendingTx'; step: 'approve' | 'batch' }
  | { kind: 'blocked'; error: SdkError };
```

Each state renders one button with its own loading flag — **never a shared `isLoading`**. `requiresConfirm: true` when projected HF < 1.2; clicking CTA opens `ReviewBorrowModal`.

**Quote input debouncing.** Amount input debounced at 300ms. HF-before-after preview uses **client-side math** from the cached quote's immutable fields (`marketParams`, `oracle.sampleScale`, last known `price()`); only calls `_getQuote` on blur or before submit (performance-oracle review). Prevents per-keystroke RPC saturation.

**UX specifications** (from protocol research):
- HF colouring + pulse as specified.
- Max button reserves `maxBorrowSafetyBuffer` headroom (default 0.95).
- Before/after HF preview lives in modal and action card.
- `LTV / LLTV` single reading (`62.4% / 86.0%`).
- Liquidation Price as first-class USD field.
- Token-primary / USD-muted formatting.
- Empty states: no collateral (→ Lend tab), liquidity insufficient (disabled CTA + tooltip).
- Repay input max is **clamped client-side** to `position.borrowAssets` — prevents `REPAY_EXCEEDS_DEBT`.

## Alternative Approaches Considered

- **Aave-first borrow provider.** Rejected: demo already has full Morpho lending infrastructure. Aave is a future second provider.
- **Raw USDC collateral.** Rejected: loses the yield + borrow narrative.
- **Reverse market (OP → USDC).** Rejected: not needed for demo.
- **FixedPriceOracle for dUSDC.** Rejected during reconciliation.
- **LLTV 94.5%.** Rejected for 86%; reasoning documented in brainstorm.
- **Unified `MarketId` type.** Rejected: LendMarketId is address-based, BorrowMarketId is params-derived bytes32.
- **Separate Borrow package.** Rejected: tight integration with Wallet/Actions.
- **Morpho Bundler3 as primary path.** Rejected after research: (a) not deployed on baseSepolia, (b) `initiator()` transient-storage design requires smart-wallet authorization grant (extra tx, EOA-only `setAuthorizationWithSig` not available for ERC-4337), (c) pulls large transitive SDK deps, (d) calldata integrity validation becomes harder (nested `Call[]` + adapter selectors). Revisit on mainnet where Bundler3 is deployed and audited.
- **TWAP oracle wrapper for demo.** Rejected: over-scope for baseSepolia demo; documented as "must add for production" in Risk Analysis.

## System-Wide Impact

### Interaction graph

`Wallet.borrow.openPosition(params | quote)` → `WalletBorrowNamespace.openPosition` → `BorrowProvider.openPosition` (validates chain, asset allowlists, amount → wei, settings-clamped safety buffer; if quote: staleness check + calldata integrity) → `MorphoBorrowProvider._openPosition` (checks allowance, conditionally adds approval, builds supplyCollateral + borrow as a `Call[]`) → `BaseWalletNamespace.executeTransactionBatch` (shared) → `Wallet.sendBatch(calls)` → Privy smart-wallet `eth_sendUserOperation` (ONE userOp, `callData = executeBatch(calls)`) → bundler → Morpho Blue on-chain.

Receipts emit `SupplyCollateral` and `Borrow`. Frontend writes `ActivityEntry{type:'borrow', metadata:{...}}` to localStorage.

### Error & failure propagation

- **Pre-flight** (typed `SdkError` subclasses thrown from `BorrowProvider`): `NoCollateralError`, `InsufficientLiquidityError`, `UnhealthyPositionError`, `QuoteStaleError`, `ChainMismatchError`, `MarketNotCreatedError`, `BorrowProviderNotConfiguredError`.
- **Calldata integrity** (`CalldataMismatchError{field}`): fail-closed; catch-all wraps decode errors; return type `void`.
- **RPC / oracle**: `OracleUnavailableError` (oracle revert caught with original error attached). Positions become "frozen but not lost" while oracle is down — documented.
- **Execution**: single userOp atomicity eliminates partial-batch states. Only remaining non-atomic window: user backs out between quote and execute; dangling allowance detected and skipped next flow.
- **Session**: Privy errors surface as `SessionExpiredError`; state machine returns to initial state.

### State lifecycle risks

- **Approval leaks.** Only when user backs out mid-flow. Re-detected on next quote; no loss.
- **Interest-accrual drift.** Full repay via shares is atomic with execution block — no dust.
- **Collateral locked during lend close.** `Lend.closePosition` checks pledged dUSDC; returns `CollateralLockedAsBorrowError` if pledged. New guard in Phase 4.
- **ActivityLog rehydration.** On mount, single multicall fetches all relevant positions; diffed against localStorage entries client-side. Mismatches → one reconciliation toast. Does not auto-delete — preserves audit trail.
- **MetaMorpho curator trust.** The vault's allocator can move funds to/from child markets. Demo trusts the curator (we control it); production would need a curator-aware risk policy.
- **Oracle freeze.** If `oracle.price()` reverts, Morpho's `_isHealthy` reverts, blocking borrow/withdraw/liquidate. Partial repay with asset amounts still works. Positions frozen but safe.

### API surface parity

Unchanged from base plan — read/signing/backend/frontend namespaces remain per brainstorm §7.

### Integration test scenarios

1. **Happy path end-to-end** (baseSepolia): mint → lend → yield accrual → borrow quote → openPosition → assert balances + position + events → closePosition({mode:'full'}) → assert `position.borrowSharesRaw === 0n` (dust check).
2. **Stale quote** (time + block), expect `QuoteStaleError`.
3. **Calldata tamper** (per `field`), expect `CalldataMismatchError` with correct discriminator — unit test, not integration.
4. **Oracle yield accrual**: vault yield increases → `maxBorrowable` grows without user action.
5. **Lend close while pledged**: expect `CollateralLockedAsBorrowError`.
6. **Full repay dust check**: after ≥100 blocks of accrual, full repay via shares → `position.borrowSharesRaw === 0n`.

Unit-test scenarios 2, 3; integration-test scenarios 1, 4, 5, 6.

## Acceptance Criteria

### Functional

- [ ] `getQuote({kind:'byCollateral'})` and `getQuote({kind:'byBorrow'})` produce mutually consistent results (round-trip within 1 wei).
- [ ] `BorrowQuote` is deeply frozen; `quote.withBorrowAmount(x)` returns a new quote with recomputed `execution`, `healthFactor`/`healthFactorRaw`, `liquidationPrice`/`liquidationPriceRaw`.
- [ ] `openPosition(quote)` rejects if `quote._tag !== 'BorrowQuote'`.
- [ ] `closePosition({mode:'full'})` post-condition `position.borrowSharesRaw === 0n`.
- [ ] `closePosition({mode:'partialAssets', assets})` does not withdraw collateral unless `withdrawCollateral: true`.
- [ ] `MorphoCalldataValidator` throws `CalldataMismatchError` with correct `field` for each tamper case (7 cases); throws `{field:'decode'}` on random-bytes input.
- [ ] Full-repay re-fetches `position.borrowSharesRaw` inside `_closePosition` — not from quote time.
- [ ] `DynamicVaultOracle` constructor reverts on invalid `SCALE_FACTOR` or implausible `loanPerUnderlyingWad` (< 1e15 or > 1e21).
- [ ] `DynamicVaultOracle.price()` fork-tested: monotonic increase under vault-yield simulation; donation attack moves price by less than virtual-share dilution bound.
- [ ] `DeployMorphoBorrowMarket.s.sol` asserts `MORPHO_BLUE == EXPECTED_MORPHO_BLUE_FOR_CHAIN[chainId]` and `isLltvEnabled(86%)` before `createMarket`.
- [ ] `deploy-demo.sh` is idempotent — rerun after any completed step is a no-op for that step; re-run after partial failure resumes.
- [ ] JSON artifacts (`state/borrow-market.<chainId>.json`) have validated schema via `jq` before use.
- [ ] Frontend Borrow tab visible on desktop + mobile; `TABS.map(t => t.id)` drives mobile menu.
- [ ] `BorrowCtaState` machine rendered: each state has its own button and its own loading flag.
- [ ] Approval and Borrow buttons each have independent loading; after approval confirms, CTA auto-advances without page refresh.
- [ ] `ReviewBorrowModal` opens when projected HF < 1.2 and requires explicit checkbox to submit.
- [ ] Quote countdown visible; auto-refresh at T-5s; hard-stop with "Refresh quote" when expired.
- [ ] Repay input max clamped client-side to `position.debt` (human-readable; bigint equivalent is `position.debtRaw`).
- [ ] `wallet.borrow` is always defined (null-namespace when no provider); method calls throw typed `BorrowProviderNotConfiguredError`.
- [ ] `wallet.sendBatch(calls)` produces exactly one userOp with an `executeBatch` callData (unit test with mocked Privy client).
- [ ] Allowance check skips approval when `allowance >= collateralAmountRaw`.
- [ ] `Lend.closePosition` on pledged dUSDC returns `CollateralLockedAsBorrowError`.
- [ ] `maxBorrowSafetyBuffer` default is 0.95; bounds validated at config load.

### Non-functional

- [ ] Build, typecheck, lint pass across all packages.
- [ ] `BorrowTab` route-split: not in the main bundle.
- [ ] viem public client for borrow reads uses `batch: { multicall: true }`; `_getQuote` completes in 1 RPC round-trip.
- [ ] Quote input debounced ≥ 250ms; keystrokes never trigger RPC.
- [ ] No `any` types in borrow code; all decoded function args type-narrowed via `functionName` discriminator.
- [ ] No inline `.toFixed` in components; all numeric formatting via `formatTokenAmount` / `formatUsd`.
- [ ] All new SDK public API JSDoc'd with `@description`/`@param`/`@returns`/`@throws`.
- [ ] Oracle contract source-verified on basescan.
- [ ] Slither high/medium findings = 0 on `DynamicVaultOracle.sol`.

### Quality gates

- [ ] Phase 1a merged separately with its own review.
- [ ] Cleanup PR for `MorphoLendProvider._getPosition` decimal bug merged before Phase 3.
- [ ] Every new public function/component ships with at least one test; every error class has a test that raises it.
- [ ] Zero new lint warnings introduced (not just zero errors); no `eslint-disable` added without reviewer-approved justification.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` clean on every commit.
- [ ] Integration test scenarios pass against baseSepolia deployment.
- [ ] Docker images build cleanly for backend + frontend.
- [ ] Default CI (`pnpm test` + `forge test`) completes in < 5 minutes; fork/integration tests behind nightly + `needs-integration` label.

## Testing Strategy

### Solidity — `DynamicVaultOracle.t.sol`

Named test functions:

1. `test_Price_FreshVault_ReturnsExpectedScale` — asserts `price()` magnitude on a 1:1 vault.
2. `test_Price_AfterYield_IncreasesMonotonically` — deal USDC to vault; assert `price_after > price_before`.
3. `test_Price_DonationAttack_IsDiluted` — with virtual-share seed in place, `token.transfer(vault, 1e9 USDC)` moves `price()` by less than `price_before / 1000`.
4. `test_Price_Regression_UnderflowSample_Reverts` — documents that the sample-derivation path guards against the PAXG-class footgun.
5. `test_Price_UnderlyingDecimalsMismatch_Reverts` — mock 18-dec underlying causes constructor revert.
6. `testFuzz_Price_NeverReverts(uint128 totalAssets, uint128 totalSupply)` — bounded above 0, assert `price()` succeeds.
7. `testFuzz_Price_ScalesLinearlyWithLoanPerUnderlying(uint256)` — fuzz constructor param within allowed range; assert linear scaling.
8. `invariant_PriceNonDecreasingUnderDepositsAndYield` — handler exposes `vaultDeposit` and `simulateYield`; invariant `oracle.price() >= lastPrice`.
9. `test_FlashLoanManipulation_BoundedImpact` — fork test; attacker flash-borrows USDC, deposits, reads price, withdraws; documents movement bound (this is the "acknowledged risk" test — demonstrates the manipulability the Risk Table documents).
10. `test_ReentrancyViaOracle_Safe` — craft malicious adapter returning altered `convertToAssets`; assert Morpho Blue behaviour is graceful.
11. `test_Constructor_EmitsOracleDeployedEvent` — ensures verifiable deploy trail.

**Fork test suite.** Pin baseSepolia block; fork real MetaMorpho vault; mock only USDC transfers to simulate yield. Shared `setUp()` across tests in the file (reuse one anvil fork).

**Fuzz/invariant budgets.** `[profile.default]` 1000 fuzz runs (every push); `[profile.deep]` 10k runs + invariant depth 50 (nightly).

**Not tested** (per Foundry-testing skill guidance): OpenZeppelin ERC20/4626 internals; that `convertToAssets` is monotonic (Morpho's concern); trivial getters.

### TypeScript — vitest

- Subclass-to-expose-protected for abstract BorrowProvider tests.
- Mock `viem.createPublicClient` only at chain-manager boundary; NEVER mock `encodeFunctionData`/`decodeFunctionData`/`keccak256`/`encodeAbiParameters` — those are pure and load-bearing for calldata validation.
- Mock `@morpho-org/blue-sdk-viem` fetch methods with plain-object fixtures.
- Table-driven calldata-validator failure matrix (7 `field` cases + 1 random-bytes case).

### Unit vs integration split

| Suite | Runtime budget | When |
|---|---|---|
| `forge test` (unit + fuzz 1k) | < 90s | every push |
| `forge test --match-test invariant_` | < 60s | every push |
| `forge test --match-path "*.fork.t.sol"` | ~2 min | nightly + `needs-fork` |
| `pnpm --filter sdk test` (vitest) | < 30s | every push |
| `pnpm test:integration` (baseSepolia network) | ~3–5 min | nightly + `needs-integration` |

Unit-tested: validator, quote immutability, error classes, staleness, HF bucketing, `closePosition({mode:'full'})` args.

Integration-tested: happy path round-trip, dust-check, `Lend.closePosition` lock against pledged dUSDC.

## Success Metrics

- Demo user completes full loop (lend → borrow → repay → unwind) in one session without intervention.
- SDK types compile for external consumers without downstream changes.
- Time-to-first-borrow ≤ 3 user clicks from Borrow tab entry.
- Zero post-full-repay dust across integration tests.
- `_getQuote` p50 latency < 400ms on baseSepolia (single multicall round-trip).

## Dependencies & Prerequisites

- `@morpho-org/blue-sdk-viem` ≥ 3.1.1, `@morpho-org/blue-sdk` ≥ 4.5.1, `viem` ≥ 2.24.1.
- Phase 1a blocks Phases 3–6; Phase 2 blocks Phase 3 integration tests and Phase 6 E2E.
- LLTV 86% enabled on target chain's Morpho Blue — asserted in deploy script.
- Privy smart-wallet implementation (Kernel/Safe/LightAccount/Coinbase/Biconomy) supports `sendTransaction({calls: […]})` → single userOp with `executeBatch`/MultiSend callData. Verified during Phase 3.
- Separate cleanup PR for `MorphoLendProvider._getPosition` decimal bug merged before Phase 3.

## Risk Analysis & Mitigation

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Oracle decimals bug (PAXG-class) | Low | Critical | Internal sample derivation + constructor self-check + fork tests including regression for underflow case |
| **Oracle manipulation via `convertToAssets`** | **Medium** | **High** | Virtual-share seed + documented testnet trust disclaimer + flash-loan fork test characterizing bound. Production: add TWAP or per-block delta cap. |
| MarketParams id mismatch (validator false-positive/negative) | Low | High | Use `getMarketId` from blue-sdk (matches assembly); fixture test asserts SDK-derived id == on-chain id for known market |
| Privy `sendBatch` dispatches N userOps instead of 1 | Low | High | Unit test asserts single `sendTransaction({calls})` call to Privy client. If wrong, atomicity lost. |
| Gas estimation underestimate on batch | Medium | Medium | 1.25× safety multiplier on `callGasLimit` |
| Phase 1a namespace refactor breaks existing lend/swap | Low | High | Own review checkpoint; existing tests must pass unchanged; all import sites updated atomically (no shims — demo is sole consumer, so grep + edit covers the surface) |
| Full-repay dust | Low | Medium | Re-fetch shares at execution; dedicated integration test |
| LLTV 86% aggressive for dUSDC↔OP | Low | Medium | Demo-only; documented; production would use 62.5–77% |
| Flash-loan oracle exploit on testnet | Medium | Low (testnet) | Acknowledged; risk disclosure on-screen; mitigates by faucet-gating OP and per-address borrow cap if needed |
| Hardcoded `loanPerUnderlyingWad` drifts vs real market | N/A | Low (testnet) | Documented demo assumption; banner on UI |
| MetaMorpho curator malicious | Low | High | Demo controls curator; production needs curator-aware policy |

## Future Considerations

- **AaveBorrowProvider** — second provider; shares `BaseBorrowNamespace`.
- **Real oracle feeds** — swap `DynamicVaultOracle` for `MorphoChainlinkOracleV2` + OP/USDC feed on mainnet.
- **Bundler3 on mainnet** — reconsider when shipping to a chain where it's deployed and audited.
- **SwapProvider calldata validator** — backport via #373 once Morpho validator is battle-tested.
- **Settings on LendConfig** — harmonise after real need emerges; optional-settings placeholder already present to avoid silent divergence.
- **`getPositions` plural on LendProvider** — add after Phase 3 API harmonization issue resolves.
- **Liquidation UX** — Morpho Blue liquidations happen externally; add "Liquidated" ActivityLog state later.
- **Reverse market (OP collateral → USDC)** — purely additive.
- **Cross-protocol migrations** (Aave → Morpho) — where Bundler3 adapters actually earn their keep.

## Documentation Plan

- Update `packages/sdk/README.md` with `Actions.borrow` and `Wallet.borrow` API reference.
- Update `packages/demo/README.md` with borrow flow screenshots.
- Run `pnpm docs` (TypeDoc) on SDK.
- New `docs/guides/borrow-integration.md` with end-to-end integration sample.
- New `docs/patterns/providers.md` codifying the `packages/sdk/src/providers/<protocol>/` cross-domain directory convention.

## Sources & References

### Origin

- **Brainstorm:** [`docs/brainstorms/2026-04-15-morpho-borrow-provider-brainstorm.md`](../brainstorms/2026-04-15-morpho-borrow-provider-brainstorm.md). Key decisions carried forward: separate `LendMarketId` / `BorrowMarketConfig` types (§5), shared `BaseNamespace` (§7), calldata integrity validation as novel capability (§4), dynamic oracle via `vault.convertToAssets()` (resolved), LLTV 86% (resolved), full Base/Actions/Wallet namespace trio (§7).

### Internal references

- `packages/sdk/src/lend/core/LendProvider.ts` — base template; `:209` decimal bug (separate PR).
- `packages/sdk/src/swap/core/SwapProvider.ts:67,131,410` — quote-draft + discriminator patterns.
- `packages/sdk/src/lend/namespaces/BaseLendNamespace.ts:57-61` — hard-coded anti-pattern replaced by inherited generic `BaseNamespace`.
- `packages/sdk/src/lend/namespaces/__tests__/BaseLendNamespace.spec.ts` — filename-convention precedent (`.spec.ts` for namespaces).
- `packages/demo/backend/src/services/lend.spec.ts` — backend filename precedent.
- `packages/sdk/src/lend/__mocks__/MockLendProvider.ts:33-60` — `MockedFunction` pattern to replicate.
- `packages/sdk/src/core/error/errors.ts` — existing `TransactionConfirmedButRevertedError`; new `SdkError` hierarchy lands here.
- `packages/demo/contracts/script/DeployMorphoMarket.s.sol` — template for `DeployMorphoBorrowMarket.s.sol`; rename to `DeployMorphoLendMarket.s.sol`.
- `packages/demo/contracts/src/FixedPriceOracle.sol` — reference for scale formula.
- `packages/demo/frontend/src/components/earn/ReviewSwapModal.tsx` — `ReviewBorrowModal` pattern reference.
- `packages/demo/frontend/src/components/earn/Action.tsx:57-179` — shared `isLoading` anti-pattern to avoid.
- `docs/specs/aave-borrow-provider.md`, `docs/specs/borrow-provider-detailed.md`, `docs/specs/borrow-provider-summary.md` — prior draft specs; brainstorm supersedes.

### External references

#### Morpho + oracle
- [IMorpho interface](https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IMorpho.sol)
- [IOracle interface](https://github.com/morpho-org/morpho-blue/blob/main/src/interfaces/IOracle.sol)
- [MorphoChainlinkOracleV2](https://github.com/morpho-org/morpho-blue-oracles/blob/main/src/morpho-chainlink/MorphoChainlinkOracleV2.sol)
- [VaultLib](https://github.com/morpho-org/morpho-blue-oracles/blob/main/src/morpho-chainlink/libraries/VaultLib.sol)
- [SharesMathLib](https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/SharesMathLib.sol)
- [MarketParamsLib](https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/MarketParamsLib.sol)
- [Morpho LTV concepts](https://docs.morpho.org/build/borrow/concepts/ltv)
- [Morpho liquidation mechanics](https://docs.morpho.org/learn/concepts/liquidation/)
- [PAXG/USDC oracle exploit post-mortem](https://medium.com/coinmonks/decoding-morphoblues-230k-exploit-6296565ced40)
- [cUSDO/USDC AMM oracle manipulation post-mortem](https://forum.morpho.org/t/post-mortem-aerodrome-cusdo-usdc-amm-lp-oracle-manipulation-on-morpho-lending-market/1794)

#### SDK tooling
- [blue-sdk-viem abis](https://github.com/morpho-org/sdks/blob/main/packages/blue-sdk-viem/src/abis.ts)
- [blue-sdk AccrualPosition](https://github.com/morpho-org/sdks/blob/main/packages/blue-sdk/src/position/AccrualPosition.ts)
- [blue-sdk Market](https://github.com/morpho-org/sdks/blob/main/packages/blue-sdk/src/market/Market.ts)
- [viem encodeFunctionData](https://github.com/wevm/viem/blob/main/site/pages/docs/contract/encodeFunctionData.md)
- [viem decodeFunctionData](https://github.com/wevm/viem/blob/main/site/pages/docs/contract/decodeFunctionData.md)
- [viem multicall batching](https://viem.sh/docs/clients/public.html#multicall)

#### ERC-4337 / Privy
- [Privy smart wallets overview](https://docs.privy.io/wallets/using-wallets/evm-smart-wallets/overview)
- [Privy smart wallet configuration](https://docs-legacy.privy.io/guide/react/wallets/smart-wallets/configuration)
- [viem sendUserOperation (atomicity)](https://viem.sh/account-abstraction/actions/bundler/sendUserOperation)
- [ZeroDev batch transactions](https://docs.zerodev.app/smart-wallet/sending-transactions)
- [eth-infinitism EntryPoint.sol](https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/core/EntryPoint.sol)
- [Alchemy gas estimation](https://www.alchemy.com/blog/erc-4337-gas-estimation)
- [NioLabs ERC-4337 gas pitfalls](https://medium.com/@niolabsofficial/erc-4337-gas-estimation-dummy-signatures-paymasters-and-real-world-pitfalls-eca4f5bca420)

#### Bundler3 (considered, rejected)
- [Morpho Bundler3 docs](https://docs.morpho.org/get-started/resources/contracts/bundlers/)
- [bundler3 GitHub](https://github.com/morpho-org/bundler3)
- [Morpho App Incident April 10, 2025](https://morpho.org/blog/morpho-app-incident-april-10-2025/) — approval-location footgun

#### UX references (protocol research)
- [Aave borrow flow](https://aave.com/help/borrowing/borrow-tokens)
- [Aave health factor & liquidations](https://aave.com/help/borrowing/liquidations)
- [Morpho app borrow](https://docs.morpho.org/build/borrow/get-started)
- [Spark borrowing](https://docs.spark.fi/user-guides/using-sparklend/borrowing-assets)
- [Compound v3 collateral & borrowing](https://docs.compound.finance/collateral-and-borrowing/)
- [Fluid docs](https://docs.fluid.instadapp.io/)

### Related work

- Issue ethereum-optimism/actions#331 — `includeCalldata` flag for Swap quotes.
- Issue ethereum-optimism/actions#373 — backport calldata validation to `SwapProvider`.
- Issue ethereum-optimism/actions#379 — accept optional `*Raw` bigint amounts on namespace method inputs (applies to new Borrow namespaces from day one).
- Future: `MorphoLendProvider._getPosition` decimals fix (separate small PR).
- Future: `getPositions` plural on LendProvider (API harmonization issue).

## User-facing error taxonomy (typed `SdkError` subclasses)

Each error is a typed class extending `SdkError` with a structured payload — not a stringly-typed code. Frontend maps class → user message.

| Class | Payload | User message |
|---|---|---|
| `NoCollateralError` | `{ assetSymbol }` | "Lend USDC first to get dUSDC collateral." |
| `InsufficientLiquidityError` | `{ requested, available }` | "Not enough OP available to borrow. Max: {available}." |
| `UnhealthyPositionError` | `{ projectedHealthFactor }` | "This borrow would put your health factor below 1.0. Reduce borrow amount or add collateral." |
| `QuoteStaleError` | `{ quotedAt, now, reason: 'time'\|'block' }` | "Prices changed. Refresh your quote." |
| `CalldataMismatchError` | `{ field: 'to'\|'selector'\|'marketId'\|'amount'\|'shares'\|'onBehalf'\|'receiver'\|'decode' }` | "Transaction integrity check failed. Do not retry — reload the page and reconnect your wallet." (Logs `field` internally only.) |
| `OracleUnavailableError` | `{ cause }` | "Cannot price collateral right now. Try again in a moment." |
| `ChainMismatchError` | `{ expected, actual }` | "Switch to Base Sepolia to continue." |
| `MarketNotCreatedError` | `{ marketId }` | "This market isn't deployed yet." |
| `CollateralLockedAsBorrowError` | `{ marketId, pledgedShares }` | "Your dUSDC is pledged as collateral. Repay debt before withdrawing." |
| `BorrowProviderNotConfiguredError` | `{}` | (Dev error — surfaces as typed, not user-facing in demo.) |
| `SessionExpiredError` | `{ cause }` | "Session expired. Please reconnect your wallet." |

Trimmed from earlier draft: `BATCH_PARTIAL_FAILURE` (unreachable under single-userOp design), `APPROVAL_REVOKED` (pre-flight re-approves silently if needed), `LLTV_NOT_ENABLED` (deploy-only — not user-facing), `REPAY_EXCEEDS_DEBT` (prevented by client-side clamp).

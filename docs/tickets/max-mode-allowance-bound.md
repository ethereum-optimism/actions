# Bound max-mode allowances and fix deficit-vs-set ERC20 approval

>  AUGMENT existing issue #133 - this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 3 / 5 |
| **Domain** | core |
| **Surface** | `utils/approve.ts:85-90` (`resolveErc20ApprovalAmount` → `maxUint256` to Pool/vault/Blue), `utils/approve.ts:184-216` (`getApprovalDeficit`/`buildApprovalTxIfNeeded` approve deficit not set), `morpho/blue.ts:165-176` (`buildMorphoMaxLoanApproval` → unbounded `maxUint256` to Morpho Blue) |
| **Resolves findings** | F053, F042 |
| **Candidate existing issue** | #133 (augment) |
| **Blocked by** | (none) |

## Problem

Two ERC-20 allowance defects in the shared approval utilities, both fund-safety-relevant.

First, lend and borrow `approvalMode='max'` grant an **unbounded `maxUint256` standing ERC-20 allowance directly to a mutable protocol contract**. On the lend path `buildLendApproval` approves the Aave Pool (`AaveLendProvider.ts:276` `spender: poolAddress`) or the MetaMorpho vault (`MorphoLendProvider.ts:70` `spender: marketId.address`); on the borrow repay/close path `buildMorphoMaxLoanApproval` approves the Morpho Blue singleton. This is a different trust model than the swap path, where `'max'` approves Permit2 (immutable, ownerless) at the `maxUint160`-typed inner allowance (`SwapProvider.ts:325`, `resolvePermit2ApprovalAmount`). A MetaMorpho vault is curator-upgradable and the Aave Pool sits behind a governance-controlled proxy; an unlimited standing allowance to either means that if the spender is ever compromised, every user who used `'max'` has their **entire token balance drainable** until they manually revoke. It is opt-in, hence individually low, but it is a real lend/borrow-path exposure the Permit2 model was specifically chosen to avoid, and the SDK grants it silently.

Second, `getApprovalDeficit` + `buildApprovalTxIfNeeded` compute the **deficit** (`amount - current`) and feed it into an ERC-20 `approve(spender, deficit)`. Standard ERC-20 `approve` **sets** the allowance, it does not increment. So when a stale non-zero allowance exists (current `300000`, required `500000`), these helpers emit `approve(spender, 200000)`, leaving the allowance at `200000` — still below the required `500000` — and the subsequent transfer/swap/deposit reverts. The user signs an approval that is mathematically guaranteed to under-approve. These two helpers currently have **zero SDK callers and are not exported** (confirmed: every live path approves the full `requiredAmount` or `maxUint256`), so there is no production impact today, but they are SDK utilities and a unit test already enshrines the broken behavior (F245, `approve.test.ts:261-294`) by asserting the approval tx exists without ever decoding its amount, actively defending the under-approval against a fix.

## Findings

- **F053** (`packages/sdk/src/utils/approve.ts:85-90`) — `resolveErc20ApprovalAmount('max', amount)` returns `maxUint256`, and on the lend path the spender is the protocol Pool/vault itself (`AaveLendProvider.ts:276`, `MorphoLendProvider.ts:70`), so lend `'max'` hands an unbounded standing allowance straight to a mutable lending contract rather than to Permit2.
- **F053 (refines, borrow)** (`packages/sdk/src/actions/borrow/providers/morpho/blue.ts:165-176`) — `buildMorphoMaxLoanApproval` issues `approve(loanToken, MorphoBlue, maxUint256)` for shares-based (`max`) repay/close in `approvalMode='max'`; the exact-mode sibling `buildMorphoLoanApproval` (`blue.ts:145`) bounds the approval to `liveDebtAssetsWei`, so the two modes diverge and `'max'` leaves a residual unlimited allowance to the Morpho Blue singleton after the action.
- **F042** (`packages/sdk/src/utils/approve.ts:184-216`) — `getApprovalDeficit` returns `amount - current` (`:192`) and `buildApprovalTxIfNeeded` feeds that deficit into `buildErc20ApprovalTx` → `approve(spender, deficit)` (`:208-214`); because ERC-20 `approve` sets rather than increments, any non-zero prior allowance produces an under-approval. No live callers and not exported — latent, but the test at `approve.test.ts:261-294` locks the broken behavior in (F245).

## Root cause

`resolveErc20ApprovalAmount` (`approve.ts:85-90`) makes the `'max'` branch return `maxUint256` regardless of spender. That is correct for the swap path because the spender is always Permit2; it is unsafe for lend/borrow because there the spender is the protocol contract itself. The helper has no notion of who the spender is, so the trust-model distinction the swap path encodes (route `'max'` through Permit2, bound the inner allowance to `maxUint160`) is simply absent on the lend and borrow-repay paths, which call `buildErc20ApprovalTx` directly against the Pool/vault/Blue.

For F042, `getApprovalDeficit` encodes a top-up (`increaseAllowance`) mental model — "approve the gap" — onto the standard ERC-20 `approve`, which has set-not-increment semantics. The deficit is the right argument for `increaseAllowance(spender, delta)` and the wrong argument for `approve(spender, value)`. The helper computes the delta and then calls the set-style primitive, so the resulting allowance equals the delta, not the required total.

## Recommended approach

SDK fix. This is missing-obvious-validation, fail-closed-where-the-SDK-already-knows, and sibling-consistency (lend/borrow `'max'` vs swap's Permit2 `'max'`; Morpho `max` repay vs its own exact-mode sibling) — all in scope. No intent-guessing and no broad refuse-to-sign.

1. **Bound or reroute lend/borrow `'max'` allowances (F053).** The swap path already establishes the safe pattern; bring lend and borrow into line rather than granting an unbounded allowance to a mutable spender. Pick one per the #133 owner — both are in scope and the choice is a small product call, not a refactor:
   - **Default lend/borrow to exact regardless of the global `approvalMode` (preferred, minimal):** when the spender is a protocol contract (not Permit2), resolve `'max'` to the exact `requiredAmount` so no standing unlimited allowance is granted. Concretely, have `buildLendApproval` (`LendProvider.ts:286-290`) and `buildMorphoMaxLoanApproval` (`blue.ts:165-176`) approve the bounded amount, or gate the `'max'` branch of `resolveErc20ApprovalAmount` on a spender kind. This makes lend/borrow `'max'` a no-op upgrade over `'exact'` and removes the exposure entirely.
   - **Document and keep, but make it opt-in:** if an unlimited lend/borrow allowance is a wanted ergonomic, leave `'max'` granting it but (a) note on `resolveErc20ApprovalAmount` that for non-Permit2 spenders `'max'` is a standing unlimited allowance to the protocol contract, and (b) ensure the default `approvalMode` for lend/borrow is `'exact'` so a misconfiguration does not silently grant it. This is the lighter change and matches the borrow exact-mode sibling that already bounds.

   Whichever is chosen, apply it identically to the Aave lend Pool, the MetaMorpho vault, and the Morpho Blue repay/close path so all three protocol-spender sites behave consistently and none diverges from the others the way `buildMorphoMaxLoanApproval` currently diverges from `buildMorphoLoanApproval`.

2. **Fix the deficit-vs-set helpers, or delete them (F042).** Since `getApprovalDeficit`/`buildApprovalTxIfNeeded` have no callers and are not exported, the cleanest fix is to **delete them** (dead code) so the latent trap and the test that defends it both go away. If a top-up helper is genuinely wanted, instead make `buildApprovalTxIfNeeded` approve the full required `amount` (not the deficit) — `approve(spender, amount)` is the correct set-semantics call — or, if an incremental model is truly intended, emit `increaseAllowance(spender, delta)` and document the token requirement. Do not leave them encoding the deficit into a set-style `approve`.

3. **Fix the test that defends the bug (F245).** Update `approve.test.ts:261-294` to **decode the approval calldata and assert the encoded amount equals the required total** (e.g. `500000n`), not the deficit. That assertion fails against today's code and forces the F042 fix; add a sibling case where a stale non-zero allowance must be overwritten to the full required amount. If the helpers are deleted in step 2, delete this test with them.

## Affected files

- `packages/sdk/src/utils/approve.ts:85-90` — `resolveErc20ApprovalAmount`: bound the `'max'` branch for protocol (non-Permit2) spenders, or document the trust-model distinction the helper currently elides.
- `packages/sdk/src/utils/approve.ts:184-216` — `getApprovalDeficit` / `buildApprovalTxIfNeeded`: delete as dead code, or fix to approve the full `amount` / emit `increaseAllowance`.
- `packages/sdk/src/actions/lend/core/LendProvider.ts:286-290` — `buildLendApproval`: the lend `'max'` site granting `maxUint256` to `position.spender` (Pool/vault); bound or default to exact.
- `packages/sdk/src/actions/lend/providers/aave/AaveLendProvider.ts:276` — `spender: poolAddress` (Aave Pool); confirm the bounded behavior reaches this spender.
- `packages/sdk/src/actions/lend/providers/morpho/MorphoLendProvider.ts:70` — `spender: marketId.address` (MetaMorpho vault); same.
- `packages/sdk/src/actions/borrow/providers/morpho/blue.ts:165-176` — `buildMorphoMaxLoanApproval`: the borrow repay/close `'max'` site granting `maxUint256` to Morpho Blue; bound it consistently with the exact-mode sibling at `blue.ts:145`.
- `packages/sdk/src/utils/__tests__/approve.test.ts:261-294` — decode and assert the approved amount equals the required total (F245), or delete with the helpers.

## Acceptance criteria / tests

- Lend `openPosition` with `approvalMode='max'` against an ERC-20 market produces an approval whose amount equals the deposit `amountWei` (bounded) under the chosen variant — asserted for both the Aave Pool spender and the MetaMorpho vault spender so the two providers behave identically. If the document-and-keep variant is chosen instead, assert the lend default `approvalMode` is `'exact'` and that `'max'` is reachable only by explicit opt-in.
- Borrow `repay`/`close` with `amount {max:true}` and `approvalMode='max'` does not emit `approve(loanToken, MorphoBlue, maxUint256)`; it grants the bounded amount, consistent with `buildMorphoLoanApproval`'s exact-mode behavior (F053 borrow refinement). A second op does not silently reuse a residual unlimited allowance.
- `getApprovalDeficit`/`buildApprovalTxIfNeeded` are either removed (and no longer referenced anywhere in `packages/sdk/src`), or, if kept, the built approval **decodes to the full required amount**: with current `300000` and required `500000` the encoded `approve` amount is `500000`, not `200000` (F042). A sibling test overwrites a stale non-zero allowance to the full required amount.
- The `approve.test.ts` case at `:261-294` decodes the calldata amount and asserts the required total (not the deficit), so it can no longer pass against the under-approving implementation (F245).
- Full SDK `pnpm` typecheck / lint / test / build pass.

## Notes

- Augments #133 (ERC-20 approval-semantics cluster; both F053 and F042 already point there). Treat as one coherent change to the shared approval utilities plus the three protocol-spender call sites and the test fixtures.
- The swap path is the reference model and is **not** changed by this ticket: swap `'max'` correctly routes through Permit2 (`SwapProvider.ts:325`, `resolvePermit2ApprovalAmount` → `maxUint160`). The fix is to make lend and borrow match that bounded/Permit2 trust model, not to alter swap.
- Permit2 signature payloads and the swap Permit2 allowance bounds are tracked separately (`permit2-approval-owner-and-expiry`); the only overlap here is using the swap Permit2 `'max'` behavior as the consistency baseline for lend/borrow.
- The bound-vs-document choice for lend/borrow `'max'` is a small contract decision (does the SDK ever want to grant an unlimited allowance to a mutable protocol contract), not an architectural refactor. Defaulting to exact is preferred because it removes the exposure with no ergonomic loss over the existing `'exact'` mode.
- RPC trust and intent-guessing are out of scope; this ticket only enforces invariants the SDK already has the data to enforce (the spender kind is known at approval-build time; the required amount is known when computing the deficit).
- Residual lend/borrow `'max'` allowances are exactly what the consolidated Anvil feature-test's residual-allowance adversarial case asserts (catches F050/F053 on swap, and the Morpho Blue `maxUint256` residual on borrow); that end-to-end coverage is built later as the single consolidated e2e ticket, not here.

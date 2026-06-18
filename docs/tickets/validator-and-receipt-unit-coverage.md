# Unit coverage for signing-path validators and receipt-status handling

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 2 / 5 |
| **Domain** | testing |
| **Resolves findings** | F243, F211, F212, F020, F021, F034, F336, F110, F111 |
| **Candidate existing issue** | (none) |
| **Blocks** | e2e-anvil-feature-test |

## Problem

The validators that gate every fund-moving parameter onto the signing path (`validateSlippage`, `validateRecipient`, `validateNotZeroAddress`, `validateAmountPositiveIfExists`) and the receipt-status handling that decides whether a mined transaction is reported as success have **zero unit coverage** of their failure modes. The one existing validator test file (`validation.test.ts`) covers only `resolveSupportedChainIds` and `validateWalletAddress`; the EOA and smart-wallet specs mock the receipt with a hardcoded `success`/`status: 'success'`, so the negative path is never exercised.

This is a coverage / fund-safety gap, not a new logic bug. The bypasses themselves are filed and fixed under their own tickets (the slippage/amount finiteness fixes under `slippage-bounds-negative-minout`, the receipt-status gates under `receipt-status-as-success` / `eoa-batch-mid-revert-allowance`). What this ticket adds is the regression lock: focused unit tests that **encode the corrected behavior as intent (Rule 9)** so a future edit that re-opens any of these bypasses fails red instead of shipping green. Without these tests every known bypass ships green today:

- A `NaN` slippage or a slippage `>= 1` passes the range guard and lets `computeSlippageBounds` derive a **negative `amountOutMinRaw`**, signing a swap with slippage protection effectively disabled.
- A `NaN` / `+Infinity` amount passes the positivity guard and reaches calldata.
- A reverted-but-mined EOA receipt (`status: 'reverted'`) or smart-wallet UserOp receipt (`success: false`) is reported as a **successful action** to the lend / swap / borrow dispatch.
- An EOA mid-batch revert after a max-mode approval leaves a **residual standing allowance** with no deposit, reported as success, with no test reproducing it.

This is also the test-infra prerequisite the Anvil capstone leans on: `e2e-anvil-feature-test` asserts these same corrected behaviors end-to-end, so the unit-level locks land first.

## Findings

- **F243** (`packages/sdk/src/utils/__tests__/validation.test.ts:1-51`) — signing-path validators (`validateSlippage` / `validateRecipient` / `validateNotZeroAddress` / `validateAmountPositiveIfExists` / `validateQuoteNotExpired`) have zero unit tests; only `resolveSupportedChainIds` + `validateWalletAddress` are covered, so every known bypass ships green.
- **F110** (`packages/sdk/src/utils/validation.ts:111-115`) — `validateSlippage` admits `NaN`: `slippage < 0 || slippage > max` is `false` for `NaN`, so a non-finite slippage bypasses the shared range guard (and a `maxSlippage > 1` admits `slippage >= 1` → negative min-out).
- **F111** (`packages/sdk/src/utils/validation.ts:36-40`) — `validateAmountPositiveIfExists` admits `NaN` / `+Infinity`: `amount <= 0` is `false` for both, so non-finite amounts bypass the shared positivity guard.
- **F020** (`packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-73`) — `EOAWallet.send` returns a reverted receipt as success; viem resolves (not throws) for a mined-but-reverted tx and `send` never inspects `receipt.status`.
- **F021** (`packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:90-100`) — `EOAWallet.sendBatch` continues signing subsequent txs after a mid-batch revert (no `receipt.status` check), worst end-state a residual infinite allowance + false success.
- **F034** (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294,217-250`) — `send` / `sendBatch` return the UserOp receipt without inspecting `receipt.success`, so a reverted-but-mined inner call is reported as success on the main dispatch path (sibling `deploy` / `addSigner` / `removeSigner` already check `success` at `:414`, `:486`).
- **F212** (`packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294`) — no test covers a `success: false` UserOp receipt, so the smart-wallet silent-revert contract is unverified for the main dispatch methods (systemic with EOA F020).
- **F211** (`packages/sdk/src/wallet/core/wallets/eoa/__tests__/EOAWallet.spec.ts:90-321`) — `sendBatch` has zero real-execution coverage of the mid-batch-revert residual-allowance hazard; the suite mocks `sendTransaction` + `waitForTransactionReceipt` with a hardcoded `status: 'success'`.
- **F336** (`packages/cli/src/utils/parseAmount.ts:1-28` and `parseDecimal` / `parseSlippage` / `parseDeadline` / `parseApprovalMode`) — zero unit tests cover the CLI parse layer that converts commander argv into signed SDK amount / slippage / deadline params; only `receipts.test.ts` exists and command tests exercise read-only verbs.

## Root cause

The validators and the receipt-status branches were written but never given a test that exercises the *reject* / *reverted* path. The existing tests assert only the happy path (`validation.test.ts` covers two helpers; the wallet specs hardcode a successful receipt), so the comparison-based guards that are silently `false` for `NaN`/`Infinity`, and the missing `receipt.status` / `receipt.success` checks, are invisible to CI. A test that cannot fail when the business rule changes is not encoding intent (Rule 9), and these surfaces currently have no such test at all. The CLI parse layer is the entire validation boundary between argv and signed SDK params and has no test file, so a regression there silently changes a signed value.

## Recommended approach

Test-only ticket. No production logic change here; this ticket locks the behavior the sibling fix tickets establish, so it should be reviewed/merged **after or alongside** those fixes and its assertions must match their corrected behavior. In scope: missing-obvious-validation coverage, fail-closed-where-the-SDK-already-knows coverage, sibling-consistency coverage. Out of scope: any intent-guessing assertion, broad refuse-to-sign assertion, or RPC-trust assertion.

1. **Grow `validation.test.ts` into per-validator `describe` blocks (F243).** Add intent-encoding cases for each signing-path validator:
   - `validateSlippage` — throws `SlippageOutOfRangeError` for `NaN`, `Infinity`, `-Infinity`, a negative value, `1.0`, a value `> 1`, and any `slippage > maxSlippage`; accepts `0`, `0.005`, `0.5`. Include `validateSlippage(1.5, 2.0)` throwing to prove the absolute `>= 1` ceiling is independent of `maxSlippage` (F110).
   - `validateAmountPositiveIfExists` — throws `InvalidAmountError` for `NaN`, `Infinity`, `-Infinity`, `0`, and negatives; accepts `undefined` and any positive finite number (F111).
   - `validateNotZeroAddress` — throws `ZeroAddressError` for the zero address; accepts a non-zero address. `validateRecipient` — throws for the zero address, no-ops for `undefined` and for an unresolved ENS-style string (non-`isAddress` input is skipped by design), accepts a non-zero address.
   - `validateQuoteNotExpired` — throws `QuoteExpiredError` for `expiresAt <= now`, accepts a future `expiresAt` (use a fixed/faked clock).

2. **Add the negative receipt-status cases to the wallet specs (F020, F021, F034, F211, F212).** Drive the mocked `waitForTransactionReceipt` / `waitForUserOperationReceipt` with a reverted receipt and assert the corrected behavior:
   - EOA `send` with `status: 'reverted'` → assert it throws / surfaces failure (not returned as success) (F020).
   - EOA `sendBatch` where tx[0] confirms (`status: 'success'`) and tx[1] reverts → assert it stops and surfaces failure, and assert it does **not** sign/send tx[2] (the residual-allowance reproduction: `sendTransaction` called for [0],[1] only) (F021, F211).
   - Smart `send` and `sendBatch` with a UserOp receipt of `success: false` → assert failure surfaces and the result is not reported as a completed action (F034, F212). Add a sibling-consistency assertion that the `success: false` path behaves the same as the already-checked `deploy` / `addSigner` / `removeSigner` paths.
   Use the demoted-vs-confirmed framing from pass 10: these receipt-status tests are the regression lock for confirmed high logic bugs (F020/F021/F034), filed at medium because the missing test itself moves no funds.

3. **Add a CLI parse-layer test file (F336).** Cover `parseAmount` / `parseDecimal` / `parseSlippage` / `parseDeadline` / `parseApprovalMode`: reject negative amount, scientific-notation, hex, leading/trailing whitespace, and values past the magnitude guard; assert percent→decimal conversion for slippage and positive-integer enforcement for deadline; accept the canonical valid inputs. These lock the argv→signed-param boundary.

Keep every assertion tied to a corrected behavior the fix tickets define; do not assert a behavior this ticket alone would have to implement.

## Affected files

- `packages/sdk/src/utils/__tests__/validation.test.ts:1-51` — add per-validator `describe` blocks for `validateSlippage`, `validateAmountPositiveIfExists`, `validateNotZeroAddress`, `validateRecipient`, `validateQuoteNotExpired` (currently only `resolveSupportedChainIds` / `validateWalletAddress`).
- `packages/sdk/src/wallet/core/wallets/eoa/__tests__/EOAWallet.spec.ts:90-321` — add reverted-receipt `send` case and mid-batch-revert `sendBatch` case asserting no further txs are signed.
- `packages/sdk/src/wallet/core/wallets/smart/default/__tests__/DefaultSmartWallet.spec.ts:162-169,236-242` — add `success: false` UserOp-receipt negative cases for `send` / `sendBatch` plus the sibling-consistency assertion against `deploy` / `addSigner` / `removeSigner`.
- `packages/cli/src/utils/__tests__/parseAmount.test.ts` (new) — cover `parseAmount` / `parseDecimal` / `parseSlippage` / `parseDeadline` / `parseApprovalMode`.

Reference (not edited by this ticket; assertions track their corrected behavior):
- `packages/sdk/src/utils/validation.ts:36-40,111-115` — the positivity/slippage guards under test (fixed in `slippage-bounds-negative-minout`).
- `packages/sdk/src/wallet/core/wallets/eoa/EOAWallet.ts:62-100` — EOA `send`/`sendBatch` status handling (fixed in `eoa-batch-mid-revert-allowance` / `receipt-status-as-success`).
- `packages/sdk/src/wallet/core/wallets/smart/default/DefaultSmartWallet.ts:261-294` (siblings at `:414`, `:486`) — smart `send`/`sendBatch` success gate (fixed in `receipt-status-as-success`).
- `packages/cli/src/utils/parseAmount.ts:1-28` — CLI parse layer under test.

## Acceptance criteria / tests

- `validation.test.ts` has a `describe` block per signing-path validator (`validateSlippage`, `validateAmountPositiveIfExists`, `validateNotZeroAddress`, `validateRecipient`, `validateQuoteNotExpired`), each asserting both reject and accept cases listed above; the file no longer covers only the two original helpers.
- `validateSlippage` block asserts throws for `NaN` / `Infinity` / `-Infinity` / negative / `1.0` / `> 1` / `> maxSlippage`, and that `validateSlippage(1.5, 2.0)` throws (absolute ceiling independent of `maxSlippage`).
- `validateAmountPositiveIfExists` block asserts throws for `NaN` / `Infinity` / `-Infinity` / `0` / negative, and accepts `undefined` and positive finite numbers.
- EOA spec: a `status: 'reverted'` receipt makes `send` surface failure; a mid-batch revert in `sendBatch` surfaces failure **and** the assertion proves `sendTransaction` was not called for the post-revert tx (residual-allowance reproduction).
- Smart spec: a `success: false` UserOp receipt makes `send` / `sendBatch` surface failure, with a sibling-consistency assertion matching the `deploy` / `addSigner` / `removeSigner` behavior at `:414` / `:486`.
- New CLI parse test rejects negative / scientific-notation / hex / whitespace / over-magnitude amounts, asserts slippage percent→decimal and positive-integer deadline, and accepts canonical valid inputs.
- Each negative test fails (red) if its corresponding guard / status-check is reverted to the pre-fix code, proving it encodes intent (Rule 9), and passes (green) against the fixed code.
- Full `pnpm` typecheck / lint / test / build pass for both `packages/sdk` and `packages/cli`.

## Notes

- This is the test-coverage twin of the logic-fix tickets, demoted from high to medium in pass 10 because a missing test cannot itself move funds: the fund-loss / silent-success severity is owned by F020 / F021 / F034 (`receipt-status-as-success`, `eoa-batch-mid-revert-allowance`) and the negative-min-out / non-finite bypasses by F110 / F111 (`slippage-bounds-negative-minout`). Land or coordinate with those fixes so the assertions match the corrected behavior; do not assert behavior this ticket would have to implement on its own.
- The demoted-vs-confirmed framing from pass 10 is deliberate: F020/F021/F034 are confirmed high logic bugs, the coverage rows (F211/F212/F243/F336) are medium/low test-debt that fail to catch them. These tests close the test-debt rows without re-litigating the severity of the underlying bugs.
- `Blocks: e2e-anvil-feature-test` — the Anvil capstone asserts these same corrected behaviors end-to-end and depends on this test-infra ticket; the unit-level locks here land first so the capstone is not the only thing guarding these paths.
- Note the receipt shape difference when writing mocks: EOA receipts use viem's `status: 'success' | 'reverted'`, while smart-wallet UserOp receipts use a boolean `success`. The negative cases must use the right field per wallet type.
- Scope guard: assert only missing-obvious-validation, fail-closed-where-the-SDK-already-knows, and sibling-consistency behavior. No intent-guessing, no broad refuse-to-sign, no RPC-trust assertions (the reverted/`success:false` receipt is treated as ground truth, consistent with the documented RPC-trust assumption).

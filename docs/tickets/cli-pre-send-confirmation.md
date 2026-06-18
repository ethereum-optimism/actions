# Add a pre-send dry-run/summary affordance for CLI fund-moving verbs

> **AUGMENT existing issue #414 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
|-------|-------|
| **Severity** | low |
| **Complexity** | 2 / 5 |
| **Domain** | cli |
| **Surface** | swap execute / lend / borrow run actions (no confirm/dry-run gate) |
| **Resolves findings** | F329 |
| **Candidate existing issue** | #414 (augment) |
| **Blocked by** | `cli-recipient-validation-and-echo` |

## Problem

Every wallet write verb in the CLI (`swap execute`, `lend open/close`, `borrow open/close/repay/deposit-collateral/withdraw-collateral`) resolves its flags into SDK params and immediately calls the SDK sign+broadcast method. The receipt is the *first* thing the operator sees, and it is printed only **after** the transaction has already landed on-chain. There is no `--dry-run`, no `--yes`/confirmation gate, and no pre-send echo of the resolved parameters that the private key is about to sign.

Concretely, nothing surfaces the resolved `from` address, `recipient`, `chain`, `market` address, `amount`, `approvalMode`, `slippage`, or `deadline` before dispatch. A `grep` over `packages/cli/src` for `confirm`/`dry-run`/`readline`/`prompt`/`--yes` returns nothing — the affordance does not exist anywhere in the write path.

The fund-safety consequence: a mis-parsed `--chain`, a wrong `--market`, a fat-fingered `--amount`, a redirected `--recipient` (the F327 family), or an `--approval-mode max` that the operator did not mean to opt into is committed on-chain on the **first** invocation, with no checkpoint to catch it. `approvalMode`, when the flag is omitted, silently inherits the SDK/wallet default and is never echoed, so the operator cannot tell from the command whether an exact or max approval was signed. This is the single biggest missing fund-safety affordance on the write path.

This is a deliberate non-interactive design for an agent-driven CLI (a blocking prompt would break automation), so the ask is an **opt-in** preview, not a mandatory gate. The tradeoff is noted below.

## Findings

- **F329** (low, info) — `packages/cli/src/commands/wallet/swap/execute.ts:38-39` (`runWalletSwapExecute` calls `wallet.swap.execute(params)` directly inside the `try` with no pre-send echo), `packages/cli/src/commands/wallet/borrow/runBorrowAction.ts:127-128` (`runBorrowAction` calls `args.buildAndDispatch(wallet, market)` directly), and `packages/cli/src/commands/wallet/lend/runLendAction.ts:81-93` (`runLendAction` calls `openPosition`/`closePosition` directly): every write verb resolves flags and immediately sign+broadcasts, printing the structured envelope (`execute.ts:42-53`, `runBorrowAction.ts:131-149`, `runLendAction.ts:96-107`) only after the tx lands. No `--dry-run`/`--yes`/confirmation gate and no resolved-params summary exist anywhere in the CLI.

## Root cause

The write handlers are structured as resolve-then-dispatch with the output envelope as a post-landing receipt. The CLI has a single global option surface (`packages/cli/src/index.ts:31` `--json`, applied via the `preAction` hook at `index.ts:32-34`) and a stderr writer (`packages/cli/src/output/errors.ts:293`), but there is no shared seam between flag-resolution and the SDK call where a resolved-params struct could be echoed or where dispatch could be short-circuited. Because the params are only ever materialized immediately before the SDK method is invoked, there is no checkpoint for an operator or agent to inspect what will be signed.

## Recommended approach

**Review-only, no architectural refactor.** This is a CLI guardrails affordance, not a fund-safety bug in the signing path — the SDK still validates everything it already validates. Scope it as a small additive change to the existing write handlers and the global option surface; do not restructure the command tree or the output pipeline.

Add an **opt-in** pre-send affordance, defaulting to today's behavior so the non-interactive agent path is unchanged:

1. **Pre-send echo + `--dry-run`.** Add a global `--dry-run` flag alongside `--json` (`packages/cli/src/index.ts:31`). When set, each write handler resolves its params exactly as today (`buildWalletExecuteParams`, `resolveAmountOrMax`/`parseAmount`, `parseApprovalMode`, `resolveMarket`/`resolveBorrowMarket`) and prints the resolved summary — `from`, `recipient`, `chain`, `market` (name + address/marketId), `amount`, the **effective** `approvalMode` (resolved value, not the raw flag, so the inherited default is visible), `slippage`, `deadline` — then returns **before** the SDK sign+broadcast call. Emit the summary on stderr on the human path and as a structured doc on the `--json` path so the JSON contract is preserved.
2. **Optional `--yes` echo on real runs.** For a non-dry real run, optionally emit the same resolved-params summary to stderr immediately before dispatch (never on stdout, so it never pollutes the JSON envelope). This gives a logged checkpoint of exactly what was signed without adding a blocking prompt. A blocking interactive `confirm`/`readline` prompt is explicitly **out of scope** — it would break the agent automation model this CLI is built for.

**Agent-design tradeoff (note for the issue):** the non-interactive, no-prompt default is intentional and correct for this CLI; the fix is purely additive opt-in surfacing, not a behavior change to the default path. This is the natural home to surface the resolved `recipient` from the F327 recipient-visibility family — hence the `cli-recipient-validation-and-echo` blocker: the recipient validation + echo should land first so the value this ticket prints in the summary is already validated and reconciled.

## Affected files

- `packages/cli/src/commands/wallet/swap/execute.ts:33-53` — resolves `params` then immediately `wallet.swap.execute(params)`; add the echo/dry-run seam between resolution and dispatch.
- `packages/cli/src/commands/wallet/borrow/runBorrowAction.ts:118-149` — `runBorrowAction` dispatches `buildAndDispatch` directly; the shared borrow backbone is the place to echo resolved market/amounts/approvalMode.
- `packages/cli/src/commands/wallet/lend/runLendAction.ts:62-93` — resolves market/amount/approvalMode then dispatches; echo before the `openPosition`/`closePosition` call.
- `packages/cli/src/commands/wallet/borrow/open.ts` — `runWalletBorrowOpen` resolves `approvalMode` via `parseApprovalMode`; surface the effective value in the summary.
- `packages/cli/src/index.ts:31-34` — global `--json` option and `preAction` hook; add the `--dry-run`/`--yes` global option(s) and mode wiring here.
- `packages/cli/src/output/printOutput.ts` — add a resolved-params summary doc kind for the `--json` dry-run path (mirrors existing `swapExecute`/`borrowAction`/`lendAction` doc handling).

## Acceptance criteria / tests

- A global `--dry-run` flag exists; running any write verb (`swap execute`, `lend open/close`, `borrow open/close/repay/deposit-collateral/withdraw-collateral`) with `--dry-run` resolves params and prints the summary **without** calling any SDK sign+broadcast method — verified by a test that asserts the wallet `execute`/`openPosition`/`closePosition`/`buildAndDispatch` spies are **not** called.
- The dry-run summary includes the **effective** `approvalMode` (resolved default, not the raw flag) so an omitted `--approval-mode` shows `exact`, and the resolved `recipient` for swap.
- Without `--dry-run`, behavior is byte-for-byte unchanged: the existing command `__tests__` and `receipts.test.ts` still pass, and the success/error envelopes on stdout are identical (no summary leaks onto stdout).
- `--json --dry-run` emits a single structured summary doc on the JSON contract; a test asserts it round-trips through `serializeBigInt`/`writeJson` and carries the resolved fields.
- A test for the `--yes` real-run path (if implemented) asserts the pre-send summary goes to **stderr only** and the existing stdout envelope is unchanged.

## Notes

- Augments existing issue **#414** (CLI guardrails backlog). Do not open a new issue; add this color to #414 and flag it as important during implementation.
- Blocked by `cli-recipient-validation-and-echo` so the recipient surfaced in the summary is already validated/echoed (F327 family). Land that first.
- This is the natural place to surface the resolved recipient (F327 / refines:F327 at `printOutput.ts:330-335`), the resolved deadline (F330 sanity-bound work), and the effective approval mode — but those validations are separate tickets; this one only echoes the already-resolved values.
- Out of scope: any blocking interactive prompt, any change to the default non-interactive dispatch path, and any RPC-trust hardening (integrators supply their own RPC — documented assumption).
- Review-only / low-risk: no architectural refactor of the command tree or output pipeline; purely additive opt-in surfacing.

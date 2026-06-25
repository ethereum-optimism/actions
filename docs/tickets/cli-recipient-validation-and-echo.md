# Validate and echo CLI swap recipient before/after signing

> **AUGMENT existing issue #444 — this is NOT a request to open a new ticket. Add this color to that issue and flag it as important to work during implementation.**

| Field | Value |
|-------|-------|
| **Severity** | medium |
| **Complexity** | 2 / 5 |
| **Domain** | cli |
| **Surface** | `commands/actions/swap/util.ts` `buildWalletExecuteParams`, `wallet/swap/index.ts` `--recipient` flag, `wallet/swap/execute.ts` dispatch, `output/printOutput.ts` `SwapExecuteDoc` / `formatSwapExecute` |
| **Resolves findings** | F327 (and its post-send half `refines:F327`) |
| **Candidate existing issue** | #444 (augment) |
| **Blocked by** | swap-recipient-encoding-ignored, recipient-validation-symmetry |

## Problem

The swap recipient is the address that receives swap output. `actions wallet swap execute --recipient <addr|ens>` is the **only** recipient passthrough in the CLI, and it is the operator/agent-facing front door onto the SDK recipient family that the two SDK root tickets (#444 `swap-recipient-encoding-ignored`, #437 `recipient-validation-symmetry`) fix. At the CLI layer today it ships with **zero compensating control** on either side of signing:

1. **No CLI-side precheck.** `buildWalletExecuteParams` casts `flags.recipient` straight to `WalletSwapParams['recipient']` with an inline comment deferring all validation to the SDK. The CLI performs no `isAddress` / non-empty / zero-address check of its own. The sole SDK guard (`validateRecipient`) is a no-op for any value that is not already a strictly-valid 20-byte address, so `0xDEADBEEF`, a truncated hex, a flipped-checksum lookalike, or a non-ENS string bypasses validation and reaches the ENS resolver, whose verbatim-hex branch returns the input with no EIP-55 checksum and no zero-address guard (the F043/F066 root). Net at the CLI: a malformed/typo'd/poisoned/zero `--recipient` either resolves verbatim and routes swap **output** to the unintended address, or fails deep in the resolver as an opaque error instead of a clean CLI `validation` error before any signing.

2. **No echo, before or after signing.** Neither the pre-send path nor the success envelope prints the resolved recipient. `SwapExecuteDoc` / `formatSwapExecute` omit it, and even the read-only `formatSwapQuote` omits it, though `SwapQuote.recipient` and the execute result's `recipient` both exist on the SDK return. So an operator/agent cannot verify the destination at any point: the CLI prints only `swapped X for Y (price=...)` and a success (exit-0) envelope with no recipient field.

Because the demo config bakes in Velodrome, the fund-safety bite is concrete: on Velodrome v2/leaf routes the recipient **is** baked into signed calldata, so a poisoned value silently sends output to the attacker; on Uniswap V4 and Velodrome universal/CL routes the SDK silently ignores the recipient and output lands in the signer wallet — yet the flag advertises a destination the calldata does not deliver, and the exit-0 envelope confirms nothing. One sub-reviewer rated this Velodrome-advertises-but-ignores angle high/fund-loss for exactly this reason.

This ticket is **review-only / no architectural refactor**. The deeper recipient-vs-calldata mismatch and the resolver/checksum/zero gaps are owned by the SDK tickets and must be cross-referenced, not re-fixed at the CLI layer.

## Findings

- **F327** (medium, malicious-sign) — `packages/cli/src/commands/actions/swap/util.ts:118-128` (`buildWalletExecuteParams`): `flags.recipient` is cast raw to `WalletSwapParams['recipient']` at `util.ts:121` with a comment deferring all validation to the SDK; no CLI-side `isAddress` / non-empty / zero-address precheck exists. The flag is registered at `packages/cli/src/commands/wallet/swap/index.ts:37-40` and dispatched via `wallet.swap.execute(params)` at `packages/cli/src/commands/wallet/swap/execute.ts:33-39`. The success doc built at `execute.ts:42-53` never reads `result.recipient`.
- **`refines:F327`** (low, info) — `packages/cli/src/output/printOutput.ts:330-335` (`formatSwapExecute`) and the `SwapExecuteDoc` type at `printOutput.ts:88-99`: neither includes a recipient field, so the post-send success envelope (stdout text and `--json`) gives an agent no machine-readable confirmation of where funds actually went. `formatSwapQuote` (`printOutput.ts:312-320`) omits it on the read-only path too.

## Root cause

Two CLI-layer omissions on a single passthrough flag:

- **Validation deferral.** The CLI explicitly forwards `--recipient` raw on the assumption the SDK validates it, but the SDK's `validateRecipient` only zero-checks values that already pass strict `isAddress` and silently no-ops on everything else (#437). The CLI is the last layer that can reject a malformed recipient with a clean, flag-named `validation` error before the key signs.
- **Asymmetric observability.** Every other resolved swap parameter surfaces in the output envelope, but the recipient — the one field that determines where output funds land — is dropped from `SwapExecuteDoc`, `formatSwapExecute`, and `formatSwapQuote`, even though the SDK return carries it.

## Recommended approach

Review-only, no architectural refactor. Two cheap guards, plus cross-references to the SDK root tickets:

1. **Pre-check in `buildWalletExecuteParams`.** When `flags.recipient` is set and is not an ENS name, require viem `isAddress(recipient, { strict: true })` (checksummed) and reject the zero address with `CliError('validation', ...)` before dispatch. Leave ENS resolution to the SDK. This converts the deepest, opaquest failure mode (malformed hex resolving verbatim or erroring inside the resolver) into a clean, flag-named CLI error before any signing.
2. **Echo the resolved recipient, before and after signing.** Add a `recipient` field to `SwapExecuteDoc`, populate it from `result.recipient` at `execute.ts:42-53`, and print it in `formatSwapExecute` (and ideally `formatSwapQuote`), noting whether it differs from the wallet address. This gives the operator/agent a machine-readable destination confirmation on both the read-only quote and the post-trade success envelope.
3. **Cross-reference, do not re-fix.** The recipient-vs-calldata honor/ignore mismatch (#444 `swap-recipient-encoding-ignored`) and the `validateRecipient` / checksum / zero-address resolver gaps (#437 `recipient-validation-symmetry`) are the SDK-side root fixes this passthrough rides on. Do not re-implement them at the CLI layer; the CLI precheck is a defense-in-depth front door, not a replacement.

Optional (only if the SDK fixes have not landed): gate `--recipient` behind `--provider uniswap`, or reject `recipient != wallet` when Velodrome may be selected, until #444 lands so the flag does not promise behavior the calldata silently drops. This is a stopgap, not the target state.

## Affected files

- `packages/cli/src/commands/actions/swap/util.ts:118-128` — `buildWalletExecuteParams`, add the `isAddress(strict)` + zero-address precheck.
- `packages/cli/src/commands/wallet/swap/index.ts:37-40` — `--recipient <addr|ens>` flag registration (no change; reference point).
- `packages/cli/src/commands/wallet/swap/execute.ts:42-53` — populate the new `recipient` field from `result.recipient`.
- `packages/cli/src/output/printOutput.ts:88-99` — add `recipient` to `SwapExecuteDoc`.
- `packages/cli/src/output/printOutput.ts:330-335` — echo `recipient` in `formatSwapExecute`.
- `packages/cli/src/output/printOutput.ts:312-320` — (optional) echo `recipient` in `formatSwapQuote`.

## Acceptance criteria / tests

- `actions wallet swap execute ... --recipient 0xDEADBEEF` exits with a clean `validation` error naming `--recipient`, before any RPC/sign call; it no longer reaches the ENS resolver.
- `--recipient 0x0000000000000000000000000000000000000000` is rejected with a `validation` error.
- A `--recipient` that is a non-checksummed-but-length-valid hex lookalike is rejected by strict `isAddress`, not silently resolved verbatim.
- A valid ENS name (e.g. `vitalik.eth`) still passes the CLI precheck and is resolved by the SDK as today.
- On a successful swap with `--recipient <valid>`, both the stdout text and the `--json` `SwapExecuteDoc` include the resolved recipient, flagged when it differs from the wallet address.
- Unit tests cover `buildWalletExecuteParams` recipient precheck (valid address, zero address, malformed hex, ENS passthrough) and the envelope recipient field — this is currently an untested parse path (see F336).

## Notes

- Review-only / no architectural refactor: the CLI is consuming, not owning, the recipient contract. The precheck and echo are the only two changes requested here.
- Blocked by the SDK root tickets it cross-references: `swap-recipient-encoding-ignored` (#444, honor-or-reject the recipient in calldata) and `recipient-validation-symmetry` (#437, make `validateRecipient` / resolver / zero-checks agree). The CLI echo is only fully meaningful once the SDK honors the recipient consistently; until then the optional provider gate prevents the flag from advertising behavior the calldata drops.
- Sibling CLI items: F329 (#414) proposes an optional pre-send echo / `--dry-run` / `--yes` across all write verbs and is the natural broader home to surface this resolved recipient; F332 wants `recipient`/`to`/`spender` preserved in the error redactor. Both are separately tracked; this ticket is the recipient-specific, swap-execute slice.
- RPC trust is the accepted integrator-supplies-RPC assumption and is out of scope here.
